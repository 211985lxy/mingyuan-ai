import { createDecipheriv, createHash } from "node:crypto"
import { XMLParser } from "fast-xml-parser"

type XmlRecord = Record<string, unknown>

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true, parseTagValue: false })

function asRecord(value: unknown): XmlRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as XmlRecord : {}
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : ""
}

/**
 * @description 校验wecomsignature
 * @param input - 输入数据
 * @returns 无返回值
 */
export function verifyWecomSignature(input: { token: string; timestamp: string; nonce: string; encrypted: string; signature: string }) {
  const expected = createHash("sha1").update([input.token, input.timestamp, input.nonce, input.encrypted].sort().join("")).digest("hex")
  return expected === input.signature
}

function removePkcs7Padding(buffer: Buffer) {
  const padding = buffer[buffer.length - 1]
  if (!padding || padding > 32 || padding > buffer.length) throw new Error("WECOM_INVALID_PADDING")
  return buffer.subarray(0, buffer.length - padding)
}

/**
 * @description 解密wecompayload
 * @param input - 输入数据
 * @returns 无返回值
 */
export function decryptWecomPayload(input: { encrypted: string; encodingAesKey: string; corpId: string }) {
  const key = Buffer.from(`${input.encodingAesKey}=`, "base64")
  if (key.length !== 32) throw new Error("WECOM_INVALID_AES_KEY")
  const decipher = createDecipheriv("aes-256-cbc", key, key.subarray(0, 16))
  decipher.setAutoPadding(false)
  const decrypted = removePkcs7Padding(Buffer.concat([decipher.update(input.encrypted, "base64"), decipher.final()]))
  if (decrypted.length < 20) throw new Error("WECOM_INVALID_PAYLOAD")
  const messageLength = decrypted.readUInt32BE(16)
  const messageEnd = 20 + messageLength
  const message = decrypted.subarray(20, messageEnd).toString("utf8")
  const receiverId = decrypted.subarray(messageEnd).toString("utf8")
  if (input.corpId && receiverId !== input.corpId) throw new Error("WECOM_CORP_ID_MISMATCH")
  return message
}

/**
 * @description 解析wecomencryptedenvelope
 * @param xml - xml
 * @returns 无返回值
 */
export function parseWecomEncryptedEnvelope(xml: string) {
  const root = asRecord(asRecord(parser.parse(xml)).xml)
  const encrypted = stringValue(root.Encrypt)
  if (!encrypted) throw new Error("WECOM_ENCRYPT_MISSING")
  return encrypted
}

/**
 * @description 解析wecomtextmessage
 * @param xml - xml
 * @returns 无返回值
 */
export function parseWecomTextMessage(xml: string): {
  messageId?: string
  chatId: string
  senderId?: string
  content: string
  occurredAt?: string
} | null {
  const root = asRecord(asRecord(parser.parse(xml)).xml)
  if (stringValue(root.MsgType) !== "text") return null
  const content = stringValue(root.Content)
  const chatId = stringValue(root.ChatId) || stringValue(root.FromUserName)
  if (!content || !chatId) return null
  const createTime = Number(stringValue(root.CreateTime))
  return {
    messageId: stringValue(root.MsgId) || undefined,
    chatId,
    senderId: stringValue(root.FromUserName) || undefined,
    content,
    occurredAt: Number.isFinite(createTime) && createTime > 0 ? new Date(createTime * 1000).toISOString() : undefined,
  }
}
