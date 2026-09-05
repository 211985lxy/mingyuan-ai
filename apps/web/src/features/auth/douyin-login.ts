import { createHash, randomBytes } from "node:crypto"

import { prisma } from "@/lib/prisma"
import { consumeLoginCode } from "@/features/auth/sms-verification"
import { hashPassword } from "@/lib/user-auth"

export const DOUYIN_LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000

export class DouyinLoginFlowError extends Error {
  constructor(
    readonly code: "CHALLENGE_INVALID" | "CODE_INVALID" | "DOUYIN_ALREADY_BOUND",
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "DouyinLoginFlowError"
  }
}

export function hashDouyinLoginState(state: string): string {
  return createHash("sha256").update(`douyin-login:${state}`).digest("hex")
}

export async function createDouyinLoginChallenge(input: {
  state: string
  openId: string
  unionId?: string | null
  scope: string
}): Promise<string> {
  const challenge = await prisma.douyinLoginChallenge.create({
    data: {
      stateHash: hashDouyinLoginState(input.state),
      openId: input.openId,
      unionId: input.unionId ?? null,
      scope: input.scope,
      expiresAt: new Date(Date.now() + DOUYIN_LOGIN_CHALLENGE_TTL_MS),
    },
  })
  return challenge.id
}

export async function completeDouyinPhoneLogin(input: {
  challengeId: string
  phone: string
  code: string
}) {
  const challenge = await prisma.douyinLoginChallenge.findUnique({
    where: { id: input.challengeId },
  })
  if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
    throw new DouyinLoginFlowError(
      "CHALLENGE_INVALID",
      401,
      "抖音登录已过期，请重新扫码",
    )
  }

  const consumed = await consumeLoginCode(input.phone, input.code)
  if (!consumed.ok) {
    throw new DouyinLoginFlowError("CODE_INVALID", 401, "验证码错误或已过期，请重新获取")
  }

  return prisma.$transaction(async (tx) => {
    const identity = await tx.douyinLoginIdentity.findUnique({
      where: { openId: challenge.openId },
    })
    const existingUser = await tx.user.findUnique({
      where: { phone: input.phone },
    })

    if (identity) {
      if (!existingUser || existingUser.id !== identity.userId) {
        throw new DouyinLoginFlowError(
          "DOUYIN_ALREADY_BOUND",
          409,
          "这个抖音账号已经绑定其他手机号，请使用原手机号登录",
        )
      }
      await tx.douyinLoginChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() },
      })
      return existingUser
    }

    const user = existingUser ?? await tx.user.create({
      data: {
        phone: input.phone,
        email: `${input.phone}@phone.local`,
        password: await hashPassword(randomBytes(24).toString("hex")),
        name: `用户${input.phone.slice(-4)}`,
      },
    })

    await tx.douyinLoginIdentity.create({
      data: {
        userId: user.id,
        openId: challenge.openId,
        unionId: challenge.unionId,
      },
    })
    await tx.douyinLoginChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    })
    return user
  })
}
