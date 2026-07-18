/**
 * 飞书经营事项领域模块（WP-2）。
 *
 * 这是一个纯领域层：不调用 lark-cli，不读写数据库，不接触 UI。
 * 它只负责经营事项的“状态契约”：状态机、字段解析和可写 patch 构造。
 *
 * 设计目标见 docs/plans/aim-ai-native-company-zcode-execution-plan.md §11：
 * - 五种状态：待处理 / 处理中 / 待人工审核 / 已完成 / 失败。
 * - 状态机见 §7：待处理 → 处理中 → 待人工审核 → 已完成；
 *   处理中 ↘ 失败 → 待处理；待人工审核 → 处理中（退回修改）。已完成为终态。
 * - patch 只返回可写存储字段，不包含公式、系统字段或推测字段。
 *
 * 与 lark-base-tool.ts 的边界约定一致：原始飞书记录的文本字段可能以字符串
 * 或 [{ text }] 数组形态返回；这里在边界处收窄，缺字段不伪造，类型错误不静默吞掉。
 */

/** 经营事项状态。`已完成` 为终态。 */
export type WorkItemStatus = "待处理" | "处理中" | "待人工审核" | "已完成" | "失败"

/** 经营事项所属工作流，对应计划 §6 三条业务 Loop。 */
export type WorkItemWorkflow = "内容增长" | "销售诊断" | "咨询交付"

/** 五种状态的顺序常量，供外部枚举或校验使用。 */
export const WORK_ITEM_STATES: WorkItemStatus[] = [
  "待处理",
  "处理中",
  "待人工审核",
  "已完成",
  "失败",
]

const STATUS_VALUES = new Set<string>(WORK_ITEM_STATES)
const WORKFLOW_VALUES = new Set<string>([
  "内容增长",
  "销售诊断",
  "咨询交付",
])

/**
 * 合法状态转换表。键为当前状态，值为允许跳转到的目标状态集合。
 * 已完成不在表中 → 没有任何出向转换，符合“终态”语义。
 */
const LEGAL_TRANSITIONS: Partial<Record<WorkItemStatus, WorkItemStatus[]>> = {
  待处理: ["处理中"],
  处理中: ["待人工审核", "失败"],
  待人工审核: ["已完成", "处理中"],
  失败: ["待处理"],
}

/** 解析后的经营事项。未知/缺失枚举返回空值，原始值单独暴露以便审计。 */
export interface ParsedWorkItem {
  status: WorkItemStatus | ""
  workflow: WorkItemWorkflow | ""
  aimProjectId: string
  inputContent: string
  aimResultId: string
  resultSummary: string
  resultLink: string
  errorMessage: string
  /** 原始状态字段（解析前），用于在状态异常时追溯，不参与业务逻辑。 */
  rawStatus: string
  /** 原始工作流字段（解析前）。 */
  rawWorkflow: string
}

/**
 * 收窄飞书多行/文本字段：可能是字符串，也可能是 [{ text }] 这样的段落数组。
 * 对齐 lark-base-tool.ts 中 textField 的处理：拍平为字符串，不伪造结构。
 */
function flattenText(value: unknown): string {
  if (value == null) return ""
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item && typeof item === "object" && "text" in item) {
          return String((item as { text: unknown }).text ?? "")
        }
        return String(item)
      })
      .join("")
      .trim()
  }
  return String(value).trim()
}

/**
 * 从超链接字段中取出链接。飞书超链接字段通常为 { link, text } 形态；
 * 直接给出字符串链接时也兼容。无法识别时不伪造，返回空字符串。
 */
function flattenLink(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "object" && "link" in value) {
    const link = (value as { link: unknown }).link
    return typeof link === "string" ? link.trim() : ""
  }
  return ""
}

/**
 * 解析飞书记录字段为强类型经营事项。
 * - 状态/工作流未知或缺失时返回空值并保留 raw 值，绝不映射成可执行业务状态。
 * - 缺字段统一为空字符串，不硬编码假数据（零 Mock 铁律）。
 */
export function parseFeishuWorkItem(fields: Record<string, unknown>): ParsedWorkItem {
  const rawStatus = flattenText(fields["状态"])
  const rawWorkflow = flattenText(fields["工作流"])

  const status: WorkItemStatus | "" = STATUS_VALUES.has(rawStatus)
    ? (rawStatus as WorkItemStatus)
    : ""
  const workflow: WorkItemWorkflow | "" = WORKFLOW_VALUES.has(rawWorkflow)
    ? (rawWorkflow as WorkItemWorkflow)
    : ""

  return {
    status,
    workflow,
    aimProjectId: flattenText(fields["AIM项目ID"]),
    inputContent: flattenText(fields["输入内容"]),
    aimResultId: flattenText(fields["AIM结果ID"]),
    resultSummary: flattenText(fields["结果摘要"]),
    resultLink: flattenLink(fields["结果链接"]),
    errorMessage: flattenText(fields["错误信息"]),
    rawStatus,
    rawWorkflow,
  }
}

/** 判断从 `from` 到 `to` 是否是合法状态转换。 */
export function canTransition(from: WorkItemStatus, to: WorkItemStatus): boolean {
  if (from === to) return true
  const allowed = LEGAL_TRANSITIONS[from]
  return !!allowed && allowed.includes(to)
}

export type TransitionResult =
  | { ok: true; status: WorkItemStatus; idempotent: boolean }
  | { ok: false; error: string }

/**
 * 计算状态转换。
 * - 合法跳转：返回新状态，idempotent=false。
 * - 相同状态：视为幂等，返回当前状态，idempotent=true，不报错。
 * - 非法跳转：返回失败结果，error 含原始状态对，便于上层回写“可行动错误”。
 */
export function transitionWorkItem(
  current: { status: WorkItemStatus },
  target: WorkItemStatus,
): TransitionResult {
  if (current.status === target) {
    return { ok: true, status: current.status, idempotent: true }
  }
  if (canTransition(current.status, target)) {
    return { ok: true, status: target, idempotent: false }
  }
  return {
    ok: false,
    error: `经营事项状态非法跳转：${current.status} → ${target}。已完成为终态，请按 待处理 → 处理中 → 待人工审核 → 已完成 流转，或 处理中 → 失败 → 待处理 重试。`,
  }
}

/**
 * 当前时间戳（毫秒），作为飞书“最后处理时间”日期时间字段的可写值。
 * 抽成函数便于按需替换或注入测试时钟；不使用公式字段。
 */
function nowTimestamp(): number {
  return Date.now()
}

/** 可写存储字段集合。键为飞书表字段名，值为可写入的存储值（非公式、非系统字段）。 */
export type WorkItemPatch = Record<string, unknown>

/**
 * 构造“开始处理”patch：进入处理中。
 * 不携带结果字段，避免在尚未执行时伪造结果。
 */
export function buildStartPatch(): WorkItemPatch {
  return {
    状态: "处理中" as WorkItemStatus,
    最后处理时间: nowTimestamp(),
  }
}

export interface ReviewPatchInput {
  aimResultId: string
  resultSummary: string
  resultLink: string
}

/**
 * 构造“提交审核”patch：进入待人工审核，并带回写 AIM 结果。
 * 必须有 aimResultId——没有结果就提交审核属于伪造完成，直接拒绝。
 */
export function buildReviewPatch(input: ReviewPatchInput): WorkItemPatch {
  if (!input.aimResultId.trim()) {
    throw new Error("提交审核需要 AIM结果ID，禁止在无结果时伪造审核态。")
  }

  return {
    状态: "待人工审核" as WorkItemStatus,
    AIM结果ID: input.aimResultId.trim(),
    结果摘要: input.resultSummary.trim(),
    结果链接: input.resultLink.trim(),
    最后处理时间: nowTimestamp(),
  }
}

export interface CompletePatchInput {
  aimResultId: string
  resultSummary: string
}

/**
 * 构造“完成”patch：进入已完成终态。
 * 完成必须挂结果ID；同时清空失败残留的错误信息，避免终态里留着旧错误。
 */
export function buildCompletePatch(input: CompletePatchInput): WorkItemPatch {
  if (!input.aimResultId.trim()) {
    throw new Error("完成经营事项需要 AIM结果ID，禁止在无结果时伪造已完成。")
  }

  return {
    状态: "已完成" as WorkItemStatus,
    AIM结果ID: input.aimResultId.trim(),
    结果摘要: input.resultSummary.trim(),
    错误信息: "",
    最后处理时间: nowTimestamp(),
  }
}

export interface FailPatchInput {
  errorMessage: string
}

/**
 * 构造“失败”patch：进入失败态，并写入可行动错误信息。
 * 失败语义下绝不伪造结果ID/摘要——失败就是没有结果。
 */
export function buildFailPatch(input: FailPatchInput): WorkItemPatch {
  if (!input.errorMessage.trim()) {
    throw new Error("失败 patch 必须提供可行动错误信息，禁止空错误。")
  }

  return {
    状态: "失败" as WorkItemStatus,
    错误信息: input.errorMessage.trim(),
    最后处理时间: nowTimestamp(),
  }
}

/**
 * 构造“重试”patch：从失败退回待处理，并清空旧错误。
 * 不改写结果字段；历史结果是否清理由后续真实业务规则决定。
 */
export function buildRetryPatch(): WorkItemPatch {
  return {
    状态: "待处理" as WorkItemStatus,
    错误信息: "",
    最后处理时间: nowTimestamp(),
  }
}

/**
 * 会议洞察工作流所需的飞书字段契约（WP-8 cron 无人值守接线用）。
 *
 * ⚠️ 上线前必须与飞书生产表逐字核对以下字段名：本常量集中声明、绝不散落到业务
 * 逻辑，字段名改一处即全量生效，避免“臆造字段名”导致读不到会议数据。
 * - 状态 / AIM项目ID / 输入内容 沿用 WP-2 既有契约。
 * - 会议标题 / 客户名称 为会议工作流新增字段，按现有中文字段命名规范补充。
 *   若生产表实际叫「会议主题」「客户」等，只改此处两行即可。
 */
export const MEETING_WORK_ITEM_FIELDS = {
  /** 客户项目 ID（同 WP-2 契约字段）。 */
  projectId: "AIM项目ID",
  /** 会议原文/逐字稿：会议工作流的 transcript，粘贴于「输入内容」列。 */
  transcript: "输入内容",
  /** 会议标题（会议工作流新增字段，待生产表核对）。 */
  meetingTitle: "会议标题",
  /** 客户名称（会议工作流新增字段，待生产表核对）。 */
  customer: "客户名称",
} as const

/** 从飞书记录字段解析会议洞察工作流输入。缺失项留空，不伪造。 */
export interface ParsedMeetingWorkItemInput {
  projectId: string
  transcript: string
  meetingTitle: string
  customer: string
}

/**
 * 从飞书记录字段解析会议洞察工作流所需的四类输入。
 * 复用 WP-2 的 flattenText 收窄多行/段落数组形态；缺字段统一为空字符串。
 */
export function parseMeetingWorkItemInput(
  fields: Record<string, unknown>,
): ParsedMeetingWorkItemInput {
  return {
    projectId: flattenText(fields[MEETING_WORK_ITEM_FIELDS.projectId]),
    transcript: flattenText(fields[MEETING_WORK_ITEM_FIELDS.transcript]),
    meetingTitle: flattenText(fields[MEETING_WORK_ITEM_FIELDS.meetingTitle]),
    customer: flattenText(fields[MEETING_WORK_ITEM_FIELDS.customer]),
  }
}
