import { createHash, timingSafeEqual } from "node:crypto"

export function verifyFeishuEventSignature(input: {
  timestamp: string
  nonce: string
  encryptKey: string
  bodyCandidates: string[]
  signature: string
}): boolean {
  if (!input.signature) return false

  const actualBuffer = Buffer.from(input.signature)
  return input.bodyCandidates.some((body) => {
    const expected = createHash("sha256")
      .update(input.timestamp + input.nonce + input.encryptKey + body)
      .digest("hex")
    const expectedBuffer = Buffer.from(expected)
    return actualBuffer.length === expectedBuffer.length
      && timingSafeEqual(actualBuffer, expectedBuffer)
  })
}
