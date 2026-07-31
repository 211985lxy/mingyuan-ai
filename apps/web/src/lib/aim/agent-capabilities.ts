/**
 * AIM 专家能力矩阵（单一事实源）。
 *
 * 默认拒绝、显式授权：未在本表声明的能力，任何专家都不得使用。
 * UI 隐藏、事件拦截、服务端校验都必须读本表，禁止页面散落 `agentId === "…"`。
 */

import {
  isValidAimAgent,
  normalizeAimAgentId,
  type AimAgentId,
} from "@/lib/aim-harness/contracts"

/** 长文粘贴行为：plain=不当附件；creative=可选用途；edit/review/analytics=自动用途并可发送 */
export type AimPasteMode = "plain" | "creative" | "edit" | "review" | "analytics"

export interface AimAgentCapabilities {
  pasteMode: AimPasteMode
  videoCopyExtraction: boolean
  benchmarkReference: boolean
  styleSample: boolean
  contentModeSelector: boolean
  /** 交付物动作条是否允许「发布前自查」 */
  publishCheck: boolean
  /**
   * 是否展示「思考过程 / 思考依据」。
   * 作品编辑、质检、复盘以成品修改为主，不展示与稿件无关的推理时间线。
   */
  showThinkingProcess: boolean
}

/**
 * 全量矩阵：新增 AimAgentId 未声明时，satisfies 在编译期报错。
 */
export const AIM_AGENT_CAPABILITIES = {
  business_system_diagnosis: {
    pasteMode: "plain",
    videoCopyExtraction: false,
    benchmarkReference: false,
    styleSample: false,
    contentModeSelector: false,
    publishCheck: false,
    showThinkingProcess: true,
  },
  business_diagnosis: {
    pasteMode: "plain",
    videoCopyExtraction: false,
    benchmarkReference: false,
    styleSample: false,
    contentModeSelector: false,
    publishCheck: false,
    showThinkingProcess: true,
  },
  content_producer: {
    pasteMode: "creative",
    videoCopyExtraction: true,
    benchmarkReference: true,
    styleSample: true,
    // 创作模式（社媒/长文/朋友圈）与「内容目的」三技能抢戏，默认关闭
    contentModeSelector: false,
    publishCheck: true,
    showThinkingProcess: true,
  },
  // 已并入内容创作自由模式；保留历史调用能力边界
  free_copywriter: {
    pasteMode: "creative",
    videoCopyExtraction: false,
    benchmarkReference: true,
    styleSample: false,
    contentModeSelector: false,
    publishCheck: true,
    showThinkingProcess: true,
  },
  work_editor: {
    pasteMode: "edit",
    videoCopyExtraction: false,
    benchmarkReference: false,
    styleSample: false,
    contentModeSelector: false,
    publishCheck: true,
    showThinkingProcess: false,
  },
  content_review: {
    pasteMode: "review",
    videoCopyExtraction: false,
    benchmarkReference: false,
    styleSample: false,
    contentModeSelector: false,
    publishCheck: true,
    showThinkingProcess: false,
  },
  // 粘贴平台导出文档进数；不产出可发布稿件，不开发布前自查
  content_retro: {
    pasteMode: "analytics",
    videoCopyExtraction: false,
    benchmarkReference: false,
    styleSample: false,
    contentModeSelector: false,
    publishCheck: false,
    showThinkingProcess: false,
  },
} as const satisfies Record<AimAgentId, AimAgentCapabilities>

const DENY_ALL: AimAgentCapabilities = {
  pasteMode: "plain",
  videoCopyExtraction: false,
  benchmarkReference: false,
  styleSample: false,
  contentModeSelector: false,
  publishCheck: false,
  showThinkingProcess: false,
}

/** 按专家取能力；非法 id 归一化后仍未知则默认拒绝全部。 */
export function getAimAgentCapabilities(
  agentId: string | null | undefined,
): AimAgentCapabilities {
  const normalized = normalizeAimAgentId(agentId)
  if (!isValidAimAgent(normalized)) return DENY_ALL
  return AIM_AGENT_CAPABILITIES[normalized]
}

export function agentAllowsVideoCopyExtraction(agentId: string | null | undefined): boolean {
  return getAimAgentCapabilities(agentId).videoCopyExtraction
}

export function agentAllowsContentModeSelector(agentId: string | null | undefined): boolean {
  return getAimAgentCapabilities(agentId).contentModeSelector
}

export function agentAllowsPublishCheck(agentId: string | null | undefined): boolean {
  return getAimAgentCapabilities(agentId).publishCheck
}

export function agentAllowsThinkingProcess(agentId: string | null | undefined): boolean {
  return getAimAgentCapabilities(agentId).showThinkingProcess
}
