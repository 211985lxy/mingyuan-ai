import { createHash, timingSafeEqual } from "node:crypto"

/**
 * 抖音开放平台事件订阅（Webhook）验签。
 *
 * 官方规范（developer.open-douyin.com，事件订阅 / Webhooks）：
 *   抖音服务端会把 (client_secret + 消息体) 用 SHA1 哈希，
 *   结果放在请求 Header `X-Douyin-Signature`。
 *
 * 关键点：签名是对**原始消息体字节**计算的，绝不能用 JSON.parse 后再
 * JSON.stringify 的结果，否则序列化差异（空格/键序/转义）会导致签名失配。
 * 因此调用方必须传 `request.text()` 拿到的原始字符串，而非二次序列化产物。
 */
export function verifyDouyinEventSignature(input: {
  clientSecret: string
  rawBody: string
  signature: string
}): boolean {
  const expected = createHash("sha1")
    .update(input.clientSecret + input.rawBody)
    .digest("hex")

  const actualBuffer = Buffer.from(input.signature)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

/**
 * 计算抖音事件订阅签名（测试/自检用，与 verifyDouyinEventSignature 对称）。
 */
export function computeDouyinEventSignature(clientSecret: string, rawBody: string): string {
  return createHash("sha1").update(clientSecret + rawBody).digest("hex")
}
