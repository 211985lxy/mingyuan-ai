/**
 * L0 自主放行（WP-3.1）。
 *
 * 首个动作：灵感重复链接预筛。低价值重复链接不再推人，记 auto_pass 台账。
 * 开关 AIM_AUTONOMY_L0_ENABLED 默认关。对外发送/报价/承诺/知识库正本永不走这里。
 */

export const AUTONOMY_L0_ACTION = "inspiration_duplicate_prescreen"

export function isAutonomyL0Enabled(): boolean {
  return process.env.AIM_AUTONOMY_L0_ENABLED === "true"
}

export type AutonomyLevel = "L0" | "L1" | "L2"

export function classifyInspirationPrescreen(input: {
  duplicate: boolean
  hasCanonicalUrl: boolean
}): { level: AutonomyLevel; autoPass: boolean; reason: string } {
  if (!input.duplicate) {
    return { level: "L2", autoPass: false, reason: "新灵感必须人看" }
  }
  if (!input.hasCanonicalUrl) {
    return { level: "L2", autoPass: false, reason: "重复但解不出链接，交给人" }
  }
  return {
    level: "L0",
    autoPass: true,
    reason: "重复作品链接，低价值，可直接进已处理态",
  }
}

export function autonomyL0RequestId(input: { userId: string; inspirationId: string }): string {
  return ["auto_l0", AUTONOMY_L0_ACTION, input.userId, input.inspirationId].join(":")
}

export interface AutonomyComplaint {
  createdAt: Date
}

/** 30 天内出现 ≥1 次申诉级误判 → 应降回 L2。 */
export function shouldDemoteAutonomyL0(complaints: AutonomyComplaint[], now = new Date()): boolean {
  const windowStart = now.getTime() - 30 * 24 * 3600 * 1000
  return complaints.some((item) => item.createdAt.getTime() >= windowStart)
}
