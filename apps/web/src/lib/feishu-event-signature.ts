import { createHash, timingSafeEqual } from "node:crypto"

export function verifyFeishuEventSignature(input: {
  timestamp: string
  nonce: string
  encryptKey: string
  rawBody: string
  signature: string
}): boolean {
  if (!input.signature) return false

  const expected = createHash("sha256")
    .update(input.timestamp + input.nonce + input.encryptKey + input.rawBody)
    .digest("hex")

  const actualBuffer = Buffer.from(input.signature)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer)
}
