import { createCipheriv, createHash, randomBytes } from "node:crypto"
import { describe, expect, it } from "vitest"
import { decryptWecomPayload, parseWecomEncryptedEnvelope, parseWecomTextMessage, verifyWecomSignature } from "@/lib/integrations/wecom-callback"

function encrypt(message: string, encodingAesKey: string, corpId: string) {
  const key = Buffer.from(`${encodingAesKey}=`, "base64")
  const messageBytes = Buffer.from(message)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(messageBytes.length)
  const plain = Buffer.concat([randomBytes(16), length, messageBytes, Buffer.from(corpId)])
  const padding = 32 - (plain.length % 32)
  const padded = Buffer.concat([plain, Buffer.alloc(padding, padding)])
  const cipher = createCipheriv("aes-256-cbc", key, key.subarray(0, 16))
  cipher.setAutoPadding(false)
  return Buffer.concat([cipher.update(padded), cipher.final()]).toString("base64")
}

describe("WeCom encrypted callback", () => {
  const encodingAesKey = Buffer.alloc(32, 7).toString("base64").replace(/=$/, "")
  const corpId = "ww_corp_1"
  const innerXml = "<xml><MsgType><![CDATA[text]]></MsgType><MsgId>123</MsgId><ChatId><![CDATA[group-1]]></ChatId><FromUserName><![CDATA[user-1]]></FromUserName><CreateTime>1784548800</CreateTime><Content><![CDATA[@助手 收选题 https://v.douyin.com/demo/]]></Content></xml>"

  it("verifies, decrypts and parses a text message", () => {
    const encrypted = encrypt(innerXml, encodingAesKey, corpId)
    const token = "token"
    const timestamp = "1784548800"
    const nonce = "nonce"
    const signature = createHash("sha1").update([token, timestamp, nonce, encrypted].sort().join("")).digest("hex")
    expect(verifyWecomSignature({ token, timestamp, nonce, encrypted, signature })).toBe(true)
    expect(parseWecomEncryptedEnvelope(`<xml><Encrypt><![CDATA[${encrypted}]]></Encrypt></xml>`)).toBe(encrypted)
    expect(parseWecomTextMessage(decryptWecomPayload({ encrypted, encodingAesKey, corpId }))).toEqual({
      messageId: "123",
      chatId: "group-1",
      senderId: "user-1",
      content: "@助手 收选题 https://v.douyin.com/demo/",
      occurredAt: "2026-07-20T12:00:00.000Z",
    })
  })

  it("rejects a payload for another corporation", () => {
    const encrypted = encrypt(innerXml, encodingAesKey, corpId)
    expect(() => decryptWecomPayload({ encrypted, encodingAesKey, corpId: "ww_other" })).toThrow("WECOM_CORP_ID_MISMATCH")
  })
})
