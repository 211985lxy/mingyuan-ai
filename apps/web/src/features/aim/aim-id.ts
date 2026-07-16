let sequence = 0

export function nextAimMessageId(prefix = "m") {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}
