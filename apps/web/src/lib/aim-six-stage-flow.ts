export type AimSixStage = "research" | "topic" | "content" | "edit" | "publish" | "results"

export const AIM_SIX_STAGES: readonly AimSixStage[] = ["research", "topic", "content", "edit", "publish", "results"]

export const AIM_SIX_STAGE_LABELS: Record<AimSixStage, string> = {
  research: "调研抓取",
  topic: "选题分析",
  content: "内容创作",
  edit: "作品编辑",
  publish: "作品发布",
  results: "信息复盘",
}

/**
 * @description 获取 AIM 六阶段流程中的下一个阶段
 * @param stage - 当前阶段
 * @returns 下一个阶段，已是最后阶段时返回 null
 */
export function getNextAimSixStage(stage: AimSixStage): AimSixStage | null {
  const index = AIM_SIX_STAGES.indexOf(stage)
  return index >= 0 && index < AIM_SIX_STAGES.length - 1 ? AIM_SIX_STAGES[index + 1] : null
}

/**
 * @description 判断是否可以从当前阶段推进到目标阶段
 * @param from - 起始阶段
 * @param to - 目标阶段
 * @returns 可以推进返回 true
 */
export function canAdvanceAimSixStage(from: AimSixStage, to: AimSixStage): boolean {
  return getNextAimSixStage(from) === to
}
