import { recordAimRunEvent } from "@/lib/api/client"

/**
 * @description 上报 AIM 运行事件（复制、修改、接受）
 * @param runId - 运行 ID
 * @param event - 事件类型
 * @param metadata - 事件元数据
 * @returns 无返回值
 */
export function reportAimRunEvent(
  runId: string | null | undefined,
  event: "copied" | "revised" | "accepted",
  metadata?: Record<string, unknown>,
) {
  if (!runId) return
  void recordAimRunEvent(runId, event, metadata).catch(() => undefined)
}
