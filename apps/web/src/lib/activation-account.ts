/**
 * @description 获取activationaccountlabel
 * @param email? - email?
 * @returns 无返回值
 */
export function getActivationAccountLabel(email?: string | null) {
  return email || "账号信息获取失败，请重新登录"
}
