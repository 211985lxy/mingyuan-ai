/**
 * 母内容资产契约（阶段 2）
 *
 * 存入 AimGeneration.taskSpec.canonical，不新增数据库表。
 * 确定性装配与版本规则；不调用 LLM。
 */

import type { TaskSpec } from "@/lib/task-spec"

export const CANONICAL_CONTENT_GOALS = ["曝光", "信任", "获客", "成交"] as const
export type CanonicalContentGoal = (typeof CANONICAL_CONTENT_GOALS)[number]

export const CANONICAL_EVIDENCE_SOURCE_TYPES = [
  "user_input",
  "knowledge",
  "meeting",
  "benchmark",
  "hot_topic",
] as const
export type CanonicalEvidenceSourceType = (typeof CANONICAL_EVIDENCE_SOURCE_TYPES)[number]

export interface CanonicalEvidenceItem {
  statement: string
  sourceType: CanonicalEvidenceSourceType
  sourceId?: string
  sourceLabel?: string
}

export interface CanonicalKnowledgeRef {
  id: string
  title: string
  category: string
}

export interface CanonicalModelAssumption {
  statement: string
  impact?: "low" | "medium" | "high"
}

/** 已确认版本快照（只追加，不覆盖） */
export interface CanonicalContentVersionSnapshot {
  version: number
  confirmedAt: string
  coreMessage: string
  targetCustomer: string
  realProblem: string
  contentGoal: CanonicalContentGoal
  desiredAction: string
  evidence: CanonicalEvidenceItem[]
  mustKeep: string[]
  avoid: string[]
}

export interface CanonicalContentSpec {
  schemaVersion: 1
  /** 当前版本号；首次确认 = 1 */
  version: number
  status: "draft" | "confirmed"
  confirmedAt?: string
  coreMessage: string
  targetCustomer: string
  realProblem: string
  contentGoal: CanonicalContentGoal
  evidence: CanonicalEvidenceItem[]
  personaAngle?: string
  productBridge?: string
  desiredAction: string
  mustKeep: string[]
  avoid: string[]
  /** 尚缺的关键证据（不可编造填空） */
  missingEvidence: string[]
  /** 模型假设（与企业事实分离展示） */
  modelAssumptions: CanonicalModelAssumption[]
  /** 当前用户输入快照 */
  currentInput?: string
  /** 采用的知识条目 ID（可追溯） */
  knowledgeUsed: CanonicalKnowledgeRef[]
  /** 历史已确认版本（新版本追加，不覆盖） */
  versionHistory: CanonicalContentVersionSnapshot[]
}

export interface BuildCanonicalContentInput {
  taskSpec: Pick<
    TaskSpec,
    | "goal"
    | "coreMessage"
    | "targetCustomer"
    | "realProblem"
    | "contentTask"
    | "desiredAction"
    | "ctaText"
    | "exclusiveEvidence"
    | "knownFacts"
    | "unknowns"
    | "assumptions"
  >
  /** 计划/简报中的 mustKeep / avoid（可逗号或换行分隔） */
  mustKeepText?: string
  avoidText?: string
  contentGoal?: string
  currentInput?: string
  knowledgeUsed?: CanonicalKnowledgeRef[]
  now?: string
}

const DYNAMIC_KNOWLEDGE_CATEGORIES = new Set([
  "hot_topic",
  "benchmark_reference",
  "daily_inspiration",
])

function cleanText(value: unknown, max = 500): string {
  if (typeof value !== "string") return ""
  return value.trim().slice(0, max)
}

function splitConstraintText(value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value
    .split(/[\n,，;；|/]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8)
}

/**
 * @description 将业务任务映射到母内容目标（确定性）
 */
export function mapContentTaskToGoal(contentTask?: string, explicit?: string): CanonicalContentGoal {
  const fromExplicit = cleanText(explicit, 10)
  if ((CANONICAL_CONTENT_GOALS as readonly string[]).includes(fromExplicit)) {
    return fromExplicit as CanonicalContentGoal
  }
  switch (contentTask) {
    case "吸引目标客户":
      return "曝光"
    case "建立专业信任":
    case "展示真实案例":
      return "信任"
    case "推动咨询行动":
      return "成交"
    case "筛选不适合客户":
    case "解释问题与方法":
      return "获客"
    default:
      return "信任"
  }
}

function mapKnownFactSource(source: string): CanonicalEvidenceSourceType {
  const text = source.toLowerCase()
  if (text.includes("用户") || text.includes("补充") || text.includes("输入")) return "user_input"
  if (text.includes("热点") || text.includes("hot")) return "hot_topic"
  if (text.includes("对标") || text.includes("benchmark")) return "benchmark"
  if (text.includes("会议") || text.includes("纪要") || text.includes("视频")) return "meeting"
  if (text.includes("知识") || text.includes("选题")) return "knowledge"
  return "knowledge"
}

function mapKnowledgeCategoryToSourceType(category: string): CanonicalEvidenceSourceType {
  if (category === "hot_topic" || category === "daily_inspiration") return "hot_topic"
  if (category === "benchmark_reference") return "benchmark"
  return "knowledge"
}

/**
 * @description 从 TaskSpec + 知识引用确定性装配母内容草稿（status=draft）
 */
export function buildCanonicalContentSpec(input: BuildCanonicalContentInput): CanonicalContentSpec {
  const knowledgeUsed = (input.knowledgeUsed ?? [])
    .filter((item) => item.id && item.title)
    .slice(0, 30)
    .map((item) => ({
      id: item.id,
      title: cleanText(item.title, 200),
      category: cleanText(item.category, 80) || "unknown",
    }))

  const evidence: CanonicalEvidenceItem[] = []

  for (const fact of input.taskSpec.knownFacts ?? []) {
    const statement = cleanText(fact.statement, 300)
    if (!statement) continue
    evidence.push({
      statement,
      sourceType: mapKnownFactSource(fact.source || ""),
      sourceLabel: cleanText(fact.source, 80) || undefined,
    })
  }

  for (const entry of knowledgeUsed) {
    // 动态素材池条目单独标注来源类型，但不能覆盖企业事实（仅作为 evidence，不进 mustKeep）
    evidence.push({
      statement: entry.title,
      sourceType: mapKnowledgeCategoryToSourceType(entry.category),
      sourceId: entry.id,
      sourceLabel: entry.title,
    })
  }

  if (input.currentInput?.trim()) {
    const snippet = cleanText(input.currentInput, 200)
    if (snippet && !evidence.some((item) => item.sourceType === "user_input" && item.statement === snippet)) {
      evidence.push({
        statement: snippet,
        sourceType: "user_input",
        sourceLabel: "当前输入",
      })
    }
  }

  const exclusive = cleanText(input.taskSpec.exclusiveEvidence, 300)
  const mustKeep = [
    ...splitConstraintText(input.mustKeepText),
    ...(exclusive ? [exclusive] : []),
  ].slice(0, 8)

  const avoid = splitConstraintText(input.avoidText)

  const missingEvidence = (input.taskSpec.unknowns ?? [])
    .map((item) => cleanText(item, 200))
    .filter(Boolean)
    .slice(0, 10)

  const modelAssumptions: CanonicalModelAssumption[] = (input.taskSpec.assumptions ?? [])
    .map((item) => ({
      statement: cleanText(item.statement, 300),
      impact: item.impact,
    }))
    .filter((item) => item.statement)
    .slice(0, 10)

  const coreMessage =
    cleanText(input.taskSpec.coreMessage, 300) ||
    cleanText(input.taskSpec.goal, 300)

  const desiredAction =
    cleanText(input.taskSpec.ctaText, 120) ||
    cleanText(input.taskSpec.desiredAction, 40) ||
    "进一步咨询"

  return {
    schemaVersion: 1,
    version: 0,
    status: "draft",
    coreMessage,
    targetCustomer: cleanText(input.taskSpec.targetCustomer, 200),
    realProblem: cleanText(input.taskSpec.realProblem, 300),
    contentGoal: mapContentTaskToGoal(input.taskSpec.contentTask, input.contentGoal),
    evidence: evidence.slice(0, 24),
    desiredAction,
    mustKeep,
    avoid,
    missingEvidence,
    modelAssumptions,
    currentInput: cleanText(input.currentInput, 2000) || undefined,
    knowledgeUsed,
    versionHistory: [],
  }
}

/**
 * @description 判断母内容是否已确认，可作为多平台派生基准
 */
export function isCanonicalConfirmed(spec: CanonicalContentSpec | null | undefined): boolean {
  return Boolean(spec && spec.status === "confirmed" && spec.version >= 1 && spec.coreMessage.trim())
}

function toVersionSnapshot(spec: CanonicalContentSpec, confirmedAt: string): CanonicalContentVersionSnapshot {
  return {
    version: spec.version,
    confirmedAt,
    coreMessage: spec.coreMessage,
    targetCustomer: spec.targetCustomer,
    realProblem: spec.realProblem,
    contentGoal: spec.contentGoal,
    desiredAction: spec.desiredAction,
    evidence: spec.evidence,
    mustKeep: spec.mustKeep,
    avoid: spec.avoid,
  }
}

/**
 * @description 首次确认 → v1；已确认后再次确认同内容保持版本
 */
export function confirmCanonicalContentSpec(
  draft: CanonicalContentSpec,
  now = new Date().toISOString(),
): CanonicalContentSpec {
  if (draft.status === "confirmed" && draft.version >= 1) {
    return { ...draft, confirmedAt: draft.confirmedAt ?? now }
  }
  const version = 1
  const confirmed: CanonicalContentSpec = {
    ...draft,
    status: "confirmed",
    version,
    confirmedAt: now,
  }
  return {
    ...confirmed,
    versionHistory: [toVersionSnapshot(confirmed, now)],
  }
}

function coreFactsChanged(a: CanonicalContentSpec, b: CanonicalContentSpec): boolean {
  return (
    a.coreMessage !== b.coreMessage ||
    a.targetCustomer !== b.targetCustomer ||
    a.realProblem !== b.realProblem ||
    a.contentGoal !== b.contentGoal ||
    a.desiredAction !== b.desiredAction ||
    JSON.stringify(a.evidence) !== JSON.stringify(b.evidence) ||
    JSON.stringify(a.mustKeep) !== JSON.stringify(b.mustKeep) ||
    JSON.stringify(a.avoid) !== JSON.stringify(b.avoid)
  )
}

/**
 * @description 修改核心观点或事实时创建新版本；只改措辞字段不升版
 * （personaAngle / productBridge / currentInput 视为非核心）
 */
export function reviseCanonicalContentSpec(
  previous: CanonicalContentSpec,
  nextDraft: CanonicalContentSpec,
  now = new Date().toISOString(),
): CanonicalContentSpec {
  if (!isCanonicalConfirmed(previous)) {
    return confirmCanonicalContentSpec({ ...nextDraft, versionHistory: previous.versionHistory }, now)
  }

  const merged: CanonicalContentSpec = {
    ...previous,
    ...nextDraft,
    schemaVersion: 1,
    status: "confirmed",
    version: previous.version,
    confirmedAt: previous.confirmedAt,
    versionHistory: previous.versionHistory,
    knowledgeUsed: nextDraft.knowledgeUsed.length > 0 ? nextDraft.knowledgeUsed : previous.knowledgeUsed,
  }

  if (!coreFactsChanged(previous, merged)) {
    return {
      ...merged,
      personaAngle: nextDraft.personaAngle ?? previous.personaAngle,
      productBridge: nextDraft.productBridge ?? previous.productBridge,
      currentInput: nextDraft.currentInput ?? previous.currentInput,
      missingEvidence: nextDraft.missingEvidence,
      modelAssumptions: nextDraft.modelAssumptions,
    }
  }

  const version = previous.version + 1
  const next: CanonicalContentSpec = {
    ...merged,
    version,
    status: "confirmed",
    confirmedAt: now,
  }
  return {
    ...next,
    versionHistory: [...previous.versionHistory, toVersionSnapshot(next, now)].slice(-20),
  }
}

/**
 * @description 来源可视化分组（不暴露 Prompt）
 */
export function buildCanonicalSourceView(spec: CanonicalContentSpec) {
  const enterpriseEvidence = spec.evidence.filter((item) => {
    if (item.sourceType === "user_input") return true
    if (item.sourceType === "knowledge" && item.sourceId) {
      const ref = spec.knowledgeUsed.find((entry) => entry.id === item.sourceId)
      return !ref || !DYNAMIC_KNOWLEDGE_CATEGORIES.has(ref.category)
    }
    return item.sourceType === "knowledge" || item.sourceType === "meeting"
  })

  const dynamicEvidence = spec.evidence.filter((item) => {
    if (item.sourceType === "hot_topic" || item.sourceType === "benchmark") return true
    if (item.sourceId) {
      const ref = spec.knowledgeUsed.find((entry) => entry.id === item.sourceId)
      return Boolean(ref && DYNAMIC_KNOWLEDGE_CATEGORIES.has(ref.category))
    }
    return false
  })

  return {
    currentInput: spec.currentInput || null,
    enterpriseFacts: enterpriseEvidence,
    dynamicMaterials: dynamicEvidence,
    knowledgeUsed: spec.knowledgeUsed,
    missingEvidence: spec.missingEvidence,
    modelAssumptions: spec.modelAssumptions,
  }
}

function isEvidenceItem(value: unknown): value is CanonicalEvidenceItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.statement === "string" &&
    (CANONICAL_EVIDENCE_SOURCE_TYPES as readonly string[]).includes(String(item.sourceType))
  )
}

/**
 * @description 从任意 JSON 解析母内容；非法返回 null
 */
export function parseCanonicalContentSpec(value: unknown): CanonicalContentSpec | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (input.schemaVersion !== 1) return null
  const coreMessage = cleanText(input.coreMessage, 300)
  if (!coreMessage) return null
  const contentGoalRaw = cleanText(input.contentGoal, 10)
  const contentGoal = (CANONICAL_CONTENT_GOALS as readonly string[]).includes(contentGoalRaw)
    ? (contentGoalRaw as CanonicalContentGoal)
    : "信任"
  const status = input.status === "confirmed" ? "confirmed" : "draft"
  const version = typeof input.version === "number" && input.version >= 0 ? Math.floor(input.version) : 0

  const evidence = Array.isArray(input.evidence) ? input.evidence.filter(isEvidenceItem).slice(0, 24) : []
  const knowledgeUsed = Array.isArray(input.knowledgeUsed)
    ? input.knowledgeUsed
        .filter((item): item is CanonicalKnowledgeRef => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false
          const row = item as Record<string, unknown>
          return typeof row.id === "string" && typeof row.title === "string"
        })
        .map((item) => ({
          id: item.id,
          title: cleanText(item.title, 200),
          category: cleanText(item.category, 80) || "unknown",
        }))
        .slice(0, 30)
    : []

  const mustKeep = Array.isArray(input.mustKeep)
    ? input.mustKeep.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 8)
    : []
  const avoid = Array.isArray(input.avoid)
    ? input.avoid.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 8)
    : []
  const missingEvidence = Array.isArray(input.missingEvidence)
    ? input.missingEvidence.filter((item): item is string => typeof item === "string").map((item) => cleanText(item, 200)).filter(Boolean).slice(0, 10)
    : []
  const modelAssumptions = Array.isArray(input.modelAssumptions)
    ? input.modelAssumptions
        .filter((item): item is CanonicalModelAssumption => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false
          return typeof (item as { statement?: unknown }).statement === "string"
        })
        .map((item) => ({
          statement: cleanText(item.statement, 300),
          impact: item.impact,
        }))
        .filter((item) => item.statement)
        .slice(0, 10)
    : []

  return {
    schemaVersion: 1,
    version,
    status,
    confirmedAt: typeof input.confirmedAt === "string" ? input.confirmedAt : undefined,
    coreMessage,
    targetCustomer: cleanText(input.targetCustomer, 200),
    realProblem: cleanText(input.realProblem, 300),
    contentGoal,
    evidence,
    personaAngle: cleanText(input.personaAngle, 300) || undefined,
    productBridge: cleanText(input.productBridge, 300) || undefined,
    desiredAction: cleanText(input.desiredAction, 120) || "进一步咨询",
    mustKeep,
    avoid,
    missingEvidence,
    modelAssumptions,
    currentInput: cleanText(input.currentInput, 2000) || undefined,
    knowledgeUsed,
    versionHistory: Array.isArray(input.versionHistory)
      ? (input.versionHistory as CanonicalContentVersionSnapshot[]).slice(-20)
      : [],
  }
}

/**
 * @description 从 TaskSpec JSON 读取母内容
 */
export function getCanonicalFromTaskSpec(taskSpec: unknown): CanonicalContentSpec | null {
  if (!taskSpec || typeof taskSpec !== "object" || Array.isArray(taskSpec)) return null
  return parseCanonicalContentSpec((taskSpec as { canonical?: unknown }).canonical)
}

/**
 * @description 将母内容写入 TaskSpec（不改其他字段）
 */
export function withCanonicalOnTaskSpec(
  taskSpec: TaskSpec | null | undefined,
  canonical: CanonicalContentSpec,
): TaskSpec {
  if (!taskSpec) {
    throw new Error("taskSpec 缺失，无法挂载母内容")
  }
  return { ...taskSpec, canonical }
}
