let sequence = 0

/**
 * @description nextaimmessageid
 * @param prefix - 前缀
 * @returns 无返回值
 */
export function nextAimMessageId(prefix = "m") {
  sequence += 1
  return `${prefix}-${Date.now()}-${sequence}`
}
