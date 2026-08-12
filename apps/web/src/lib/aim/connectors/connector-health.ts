export type ConnectorStatus = "healthy" | "disabled" | "degraded"

export interface ConnectorHealth {
  channel: "feishu" | "wecom"
  status: ConnectorStatus
  message: string
}

const FEISHU_MINIMUM_ENV = ["FEISHU_APP_ID", "FEISHU_APP_SECRET"] as const

export function getConnectorHealth(
  channel: ConnectorHealth["channel"],
  env: Record<string, string | undefined>,
): ConnectorHealth {
  if (channel === "wecom") return { channel, status: "disabled", message: "企业微信连接器尚未启用；AIM 网页端可独立使用。" }
  const configured = FEISHU_MINIMUM_ENV.every((key) => Boolean(env[key]?.trim()))
  return configured
    ? { channel, status: "healthy", message: "飞书增强连接器已配置。" }
    : { channel, status: "disabled", message: "飞书增强连接器未启用；AIM 网页端可独立完成闭环。" }
}
