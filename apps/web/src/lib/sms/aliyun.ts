import { createHmac } from "node:crypto"
import { env } from "@/env"
import type { SmsProvider } from "./provider"

// 阿里云短信 REST（RPC 签名 V1），不引入 SDK 依赖
const SMS_API_ENDPOINT = "https://dysmsapi.aliyuncs.com"
const SMS_API_VERSION = "2017-05-25"
const SMS_API_ACTION = "SendSms"
const SMS_API_REGION = "cn-hangzhou"

function requireAliyunConfig() {
  const missing = [
    ["ALIYUN_SMS_ACCESS_KEY_ID", env.ALIYUN_SMS_ACCESS_KEY_ID],
    ["ALIYUN_SMS_ACCESS_KEY_SECRET", env.ALIYUN_SMS_ACCESS_KEY_SECRET],
    ["SMS_SIGN_NAME", env.SMS_SIGN_NAME],
    ["SMS_TEMPLATE_CODE", env.SMS_TEMPLATE_CODE],
  ].filter(([, v]) => !v)

  if (missing.length > 0) {
    throw new Error(
      `阿里云短信配置缺失：${missing.map(([k]) => k).join(", ")}。请配置环境变量后重试。`
    )
  }

  return {
    accessKeyId: env.ALIYUN_SMS_ACCESS_KEY_ID!,
    accessKeySecret: env.ALIYUN_SMS_ACCESS_KEY_SECRET!,
    signName: env.SMS_SIGN_NAME!,
    templateCode: env.SMS_TEMPLATE_CODE!,
  }
}

/** 阿里云 RPC 签名：参数排序后做 percent-encode 拼接，HMAC-SHA1 再 encode */
function signRpcParams(
  params: Record<string, string>,
  accessKeySecret: string
): string {
  const canonicalizedQuery = Object.keys(params)
    .sort()
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&")
  const stringToSign = `POST&${encodeURIComponent("/")}&${encodeURIComponent(canonicalizedQuery)}`
  return createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign, "utf8")
    .digest("base64")
}

export const aliyunSmsProvider: SmsProvider = {
  name: "aliyun",
  async sendLoginCode(phone, code) {
    const config = requireAliyunConfig()

    const params: Record<string, string> = {
      AccessKeyId: config.accessKeyId,
      Action: SMS_API_ACTION,
      Format: "JSON",
      PhoneNumbers: phone,
      RegionId: SMS_API_REGION,
      SignName: config.signName,
      SignatureMethod: "HMAC-SHA1",
      SignatureNonce: crypto.randomUUID(),
      SignatureVersion: "1.0",
      TemplateCode: config.templateCode,
      TemplateParam: JSON.stringify({ code }),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      Version: SMS_API_VERSION,
    }
    params.Signature = signRpcParams(params, config.accessKeySecret)

    const body = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&")

    const response = await fetch(SMS_API_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })

    const result = (await response.json().catch(() => null)) as {
      Code?: string
      Message?: string
    } | null

    if (!response.ok || !result || result.Code !== "OK") {
      throw new Error(
        `阿里云短信发送失败：${result?.Code ?? response.status} ${result?.Message ?? ""}`.trim()
      )
    }
  },
}
