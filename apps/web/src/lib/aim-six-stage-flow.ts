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

export function getNextAimSixStage(stage: AimSixStage): AimSixStage | null {
  const index = AIM_SIX_STAGES.indexOf(stage)
  return index >= 0 && index < AIM_SIX_STAGES.length - 1 ? AIM_SIX_STAGES[index + 1] : null
}

export function canAdvanceAimSixStage(from: AimSixStage, to: AimSixStage): boolean {
  return getNextAimSixStage(from) === to
}

/** 编辑结果只是待发布稿，不能直接伪造为已发布。 */
export function isPublishedAimSixStage(stage: AimSixStage): boolean {
  return stage === "publish" || stage === "results"
}
