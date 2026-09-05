import { createHash, randomInt } from "node:crypto"
import { prisma } from "@/lib/prisma"

export const SMS_CODE_TTL_SECONDS = 5 * 60
export const SMS_CODE_MAX_ATTEMPTS = 5

/** 验证码哈希：sha256(盐化)，明文不落库。盐固定为应用级 JWT 之外的独立维度 —— 哈希输入含手机号防彩虹表 */
export function hashCode(phone: string, code: string): string {
  return createHash("sha256")
    .update(`sms-login:${phone}:${code}`)
    .digest("hex")
}

export function generateSixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export async function issueLoginCode(phone: string, ip: string) {
  const code = generateSixDigitCode()
  await prisma.smsVerificationCode.create({
    data: {
      phone,
      codeHash: hashCode(phone, code),
      purpose: "login",
      expiresAt: new Date(Date.now() + SMS_CODE_TTL_SECONDS * 1000),
      ip,
    },
  })
  return code
}

export type ConsumeResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "too_many_attempts" | "mismatch" }

/**
 * 验证并一次性消费最近一条有效验证码。
 * 无论成功失败都递增 attempts / 标记 consumed，防止同一码反复试。
 */
export async function consumeLoginCode(phone: string, code: string): Promise<ConsumeResult> {
  const record = await prisma.smsVerificationCode.findFirst({
    where: { phone, purpose: "login", consumedAt: null },
    orderBy: { createdAt: "desc" },
  })

  if (!record) return { ok: false, reason: "not_found" }
  if (record.expiresAt <= new Date()) return { ok: false, reason: "expired" }
  if (record.attempts >= SMS_CODE_MAX_ATTEMPTS) return { ok: false, reason: "too_many_attempts" }

  if (record.codeHash !== hashCode(phone, code)) {
    await prisma.smsVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    })
    return { ok: false, reason: "mismatch" }
  }

  await prisma.smsVerificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })
  return { ok: true }
}

/** 定期清理可安全删除的过期记录（由调用方决定何时触发） */
export async function purgeExpiredCodes(): Promise<number> {
  const result = await prisma.smsVerificationCode.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
  })
  return result.count
}
