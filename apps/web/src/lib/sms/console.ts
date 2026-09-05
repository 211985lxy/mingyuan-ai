import type { SmsProvider } from "./provider"

// 本地开发用：验证码只打印到服务端日志，不真实下发
export const consoleSmsProvider: SmsProvider = {
  name: "console",
  async sendLoginCode(phone, code) {
    console.info(`[SMS:console] 登录验证码 ${phone} -> ${code}（5 分钟内有效）`)
  },
}
