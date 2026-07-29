import { createHash } from "node:crypto"
import { describe, expect, it } from "vitest"
import { verifyFeishuEventSignature } from "@/lib/feishu-event-signature"

describe("verifyFeishuEventSignature", () => {
  it("verifies against the exact raw request body", () => {
    const timestamp = "1785312000"
    const nonce = "nonce"
    const encryptKey = "encrypt-key"
    const rawBody = '{ "encrypt": "ciphertext" }\n'
    const signature = createHash("sha256")
      .update(timestamp + nonce + encryptKey + rawBody)
      .digest("hex")

    expect(verifyFeishuEventSignature({
      timestamp,
      nonce,
      encryptKey,
      bodyCandidates: [rawBody],
      signature,
    })).toBe(true)

    expect(verifyFeishuEventSignature({
      timestamp,
      nonce,
      encryptKey,
      bodyCandidates: [JSON.stringify(JSON.parse(rawBody))],
      signature,
    })).toBe(false)

    expect(verifyFeishuEventSignature({
      timestamp,
      nonce,
      encryptKey,
      bodyCandidates: [JSON.stringify(JSON.parse(rawBody)), rawBody],
      signature,
    })).toBe(true)
  })

  it("rejects a missing or malformed signature", () => {
    const input = {
      timestamp: "1785312000",
      nonce: "nonce",
      encryptKey: "encrypt-key",
      bodyCandidates: ['{"encrypt":"ciphertext"}'],
    }

    expect(verifyFeishuEventSignature({ ...input, signature: "" })).toBe(false)
    expect(verifyFeishuEventSignature({ ...input, signature: "invalid" })).toBe(false)
  })
})
