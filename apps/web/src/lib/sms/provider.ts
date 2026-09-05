// 短信 Provider 抽象：验证码下发只经过这里，业务层不感知渠道
export interface SmsProvider {
  readonly name: "console" | "aliyun"
  /** 发送登录验证码。实现方抛错表示发送失败（计费/网络/模板错误等）。 */
  sendLoginCode(phone: string, code: string): Promise<void>
}
