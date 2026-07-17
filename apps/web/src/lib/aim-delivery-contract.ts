export type AimDeliveryQualityStatus = "pass" | "warn" | "fail" | "skipped" | null | undefined

export interface AimDeliveryContractInput {
  conversationMode?: string
  knowledgeCount: number
  knowledgeTitles?: string[]
  knowledgeStrategyLabel?: string
  degraded?: boolean | null
  qualityStatus?: AimDeliveryQualityStatus
  isCurrentVersion: boolean
  primaryNextActionLabel?: string
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
}

export interface AimDeliveryContract {
  task: { label: string; detail: string }
  evidence: { label: string; detail: string }
  status: { label: string; detail: string; tone: "success" | "warning" | "danger" | "neutral" }
  next: { label: string; detail: string }
  assumptions?: { statement: string; impact: "low" | "medium" | "high" }[]
  unknowns?: string[]
  knownFacts?: { statement: string; source: string }[]
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
  expanded: boolean // 是否需要展开详情（低风险 false，其余 true）
}

const TASK_LABELS: Record<string, string> = {
  formal_delivery: "正式交付",
  new_task: "新任务",
  clarify_task_boundary: "确认任务",
  local_edit: "局部修改",
  follow_up_edit: "追改纠偏",
  select_version: "版本延续",
  natural_chat: "自然对话",
}

export function buildAimDeliveryContract(input: AimDeliveryContractInput): AimDeliveryContract {
  const taskLabel = TASK_LABELS[input.conversationMode || ""] || "正式交付"
  const taskDetail = input.isCurrentVersion ? "当前版本" : "历史版本"

  const titles = (input.knowledgeTitles || []).filter(Boolean)
  const evidenceLabel = input.knowledgeCount > 0
    ? `当前需求 + 知识库 ${input.knowledgeCount} 条`
    : "当前需求"
  const evidenceDetail = titles.length > 0
    ? titles.slice(0, 3).join("、")
    : input.knowledgeStrategyLabel || "未引用知识库资料"

  let status: AimDeliveryContract["status"]
  if (input.degraded) {
    status = { label: "备用模型已完成", detail: "请复核关键事实后使用", tone: "warning" }
  } else if (input.qualityStatus === "fail") {
    status = { label: "未通过", detail: "需要继续修改", tone: "danger" }
  } else if (input.qualityStatus === "warn") {
    status = { label: "待优化", detail: "建议先做自查", tone: "warning" }
  } else if (input.qualityStatus === "pass") {
    status = { label: "已检查", detail: "质量检查通过", tone: "success" }
  } else {
    status = { label: "未质检", detail: "生成完成，尚未检查", tone: "neutral" }
  }

  const needsReview = input.degraded || input.qualityStatus === "fail" || input.qualityStatus === "warn"
  const nextLabel = needsReview
    ? input.qualityStatus === "fail" ? "优化后再用" : "先检查再使用"
    : input.primaryNextActionLabel || (taskLabel === "局部修改" || taskLabel === "追改纠偏"
      ? "确认修改或继续追改"
      : "复制、编辑或推进发布")

  // ── 协作认知层（TaskSpec）：按模式折叠/展开假设与缺口 ──
  const spec = input.taskSpec
  const expanded = !!(spec && spec.mode !== "direct_delivery")
  const assumptions = spec?.assumptions?.slice(0, 2)
  const unknowns = spec?.unknowns
  const knownFacts = spec?.knownFacts
  // 低风险直接交付：状态补充「已按现有资料直接完成」（不追问）
  if (spec?.mode === "direct_delivery" && !input.degraded && input.qualityStatus !== "fail") {
    status = { ...status, detail: "已按现有资料直接完成。" }
  }

  return {
    task: { label: taskLabel, detail: taskDetail },
    evidence: { label: evidenceLabel, detail: evidenceDetail },
    status,
    next: {
      label: nextLabel,
      detail: input.isCurrentVersion ? "操作当前版本" : "建议返回当前版本",
    },
    assumptions,
    unknowns,
    knownFacts,
    taskSpec: spec ?? null,
    expanded,
  }
}
