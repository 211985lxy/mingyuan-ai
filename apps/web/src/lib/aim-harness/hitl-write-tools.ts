/**
 * HITL 门闩写工具（WP-3.3）。
 *
 * 已注册进 tool-registry，但默认不进有界工具环的主动作清单。
 * 没有人工批准一律拒绝；正式写入仍走飞书/灵感既有服务，这里只做门闩。
 */

export const HITL_GATED_WRITE_TOOLS = [
  "feishu_draft_write",
  "mark_inspiration_processed",
] as const

export type HitlGatedWriteTool = (typeof HITL_GATED_WRITE_TOOLS)[number]

export function isHitlGatedWriteTool(name: string): name is HitlGatedWriteTool {
  return (HITL_GATED_WRITE_TOOLS as readonly string[]).includes(name)
}

export function executeHitlGatedWriteTool(input: {
  name: string
  approvalDecision?: string | null
  payload?: Record<string, unknown>
}): { ok: false; reason: string } | { ok: true; shadow: true; name: string } {
  if (!isHitlGatedWriteTool(input.name)) {
    return { ok: false, reason: `不是 HITL 写工具：${input.name}` }
  }
  if (input.approvalDecision !== "approve") {
    return { ok: false, reason: `写工具需 HITL 批准：${input.name}` }
  }
  return { ok: true, shadow: true, name: input.name }
}
