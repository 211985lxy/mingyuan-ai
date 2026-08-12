import { getConnectorHealth, type ConnectorStatus } from "@/lib/aim/connectors/connector-health"

type ConnectorResult = { status: ConnectorStatus; message: string }

interface FeishuConnectorDependencies {
  env: Record<string, string | undefined>
  notify: (input: { generationId: string; message: string }) => Promise<void> | void
  submitApproval: (input: { generationId: string; recordId: string }) => Promise<void> | void
  writeBackSameRecord: (input: { recordId: string; fields: Record<string, unknown> }) => Promise<void> | void
}

export function createFeishuConnector(deps: FeishuConnectorDependencies) {
  const health = () => getConnectorHealth("feishu", deps.env)
  const run = async (effect: () => Promise<void> | void): Promise<ConnectorResult> => {
    const current = health()
    if (current.status !== "healthy") return current
    try {
      await effect()
      return { status: "healthy", message: "飞书增强操作已完成。" }
    } catch (error) {
      return { status: "degraded", message: error instanceof Error ? error.message : "飞书增强操作失败，请在 AIM 网页端继续。" }
    }
  }
  return {
    health,
    notify: (input: { generationId: string; message: string }) => run(() => deps.notify(input)),
    submitApproval: (input: { generationId: string; recordId: string }) => run(() => deps.submitApproval(input)),
    writeBackSameRecord: (input: { recordId: string; fields: Record<string, unknown> }) => run(() => deps.writeBackSameRecord(input)),
  }
}
