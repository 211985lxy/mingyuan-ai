import { createHmac, timingSafeEqual } from "node:crypto"

export const AUDIT_SIGNATURE_WINDOW_SECONDS = 300

export function buildAuditSignature(body: string, timestamp: number, secret: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

export function verifyAuditSignature(
  body: string,
  timestamp: number,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!Number.isInteger(timestamp) || Math.abs(nowSeconds - timestamp) > AUDIT_SIGNATURE_WINDOW_SECONDS) return false
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false
  const expected = buildAuditSignature(body, timestamp, secret)
  const actualBuffer = Buffer.from(signature, "hex")
  const expectedBuffer = Buffer.from(expected, "hex")
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}
