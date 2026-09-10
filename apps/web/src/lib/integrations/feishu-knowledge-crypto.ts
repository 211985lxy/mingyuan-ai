import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto"

export class FeishuSecretEncryptionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FeishuSecretEncryptionError"
  }
}

/** 接受 64 位 hex 或 32 字节 base64/base64url，拒绝短口令。 */
export function decodeFeishuTokenEncryptionKey(raw?: string | null): Buffer {
  const value = raw?.trim() ?? ""
  if (!value) {
    throw new FeishuSecretEncryptionError("未配置 FEISHU_TOKEN_ENCRYPTION_KEY。")
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, "hex")
  for (const encoding of ["base64url", "base64"] as const) {
    try {
      const decoded = Buffer.from(value, encoding)
      if (decoded.length === 32) return decoded
    } catch {
      // try next encoding
    }
  }
  throw new FeishuSecretEncryptionError("FEISHU_TOKEN_ENCRYPTION_KEY 必须是 32 字节（64 位 hex 或 base64）。")
}

export function encryptFeishuSecret(plaintext: string, keyMaterial: string): string {
  if (!plaintext) throw new FeishuSecretEncryptionError("不能加密空凭证。")
  const key = decodeFeishuTokenEncryptionKey(keyMaterial)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`
}

export function decryptFeishuSecret(payload: string, keyMaterial: string): string {
  const key = decodeFeishuTokenEncryptionKey(keyMaterial)
  const parts = payload.split(".")
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new FeishuSecretEncryptionError("凭证密文格式无效。")
  }
  try {
    const iv = Buffer.from(parts[1], "base64url")
    const tag = Buffer.from(parts[2], "base64url")
    const encrypted = Buffer.from(parts[3], "base64url")
    const decipher = createDecipheriv("aes-256-gcm", key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")
  } catch (error) {
    if (error instanceof FeishuSecretEncryptionError) throw error
    throw new FeishuSecretEncryptionError("凭证解密失败，检查 FEISHU_TOKEN_ENCRYPTION_KEY 是否与落库时一致。")
  }
}

export function secretsMatch(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
