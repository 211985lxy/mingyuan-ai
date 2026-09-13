/**
 * Prompt Registry 类型定义（Step① 主线）。
 *
 * 约束：
 * - key 命名 `<domain>.<capability>.<variant>`，全局只在 PROMPT_KEYS 定义，
 *   调用点禁止写字面量。
 * - 内容统一 string：原数组形态 prompt 用 `.join("\n")` 存储，保证与现状逐字一致。
 * - 选版规则是**纯函数**（selectVersion），便于单测且不依赖 DB。
 */

/** prompt 注入位置：system=系统提示词；function=函数/工具说明；inline=片段。 */
export type PromptType = "system" | "function" | "inline"

/** 版本状态：draft 不自动生效；qualified 通过评测；active 线上生效。 */
export type PromptStatus = "draft" | "qualified" | "active"

/** prompt 正文。统一 string（数组形态已 join）。 */
export type PromptContent = string

/**
 * 批0 六个 + 批1/批2/批3 + 批4 主创作链 + 批5 格式/脚本 system。
 * 新增 prompt 必须先在此登记。
 * 批1/批2 的 function 型 seed 以 `{name}` 占位（配合 fillPromptTemplate 使用），
 * 占位符名只能用 ASCII `\w` 字符。
 */
export const PROMPT_KEYS = {
  // ── 批0：常量型 ──
  knowledgeEntityExtract: "knowledge.entity_extract.default",
  marketingShortvideo: "marketing.analysis.shortvideo",
  commentRadar: "comment.insight.radar",
  transcriptPolish: "marketing.analysis.transcript_polish",
  competitorAnalysis: "competitor.analysis.default",
  meetingInsight: "aim.meeting.insight_extract.default",
  // ── 批1：语义任务理解 ──
  semanticTaskUnderstanding: "aim.semantic_task.understanding",
  semanticTaskRepair: "aim.semantic_task.repair",
  // ── 批1：work_editor ──
  workEditorChat: "aim.work_editor.chat",
  workEditorGenerate: "aim.work_editor.generate",
  workEditorGenerateUser: "aim.work_editor.generate_user",
  // ── 批1：content_review ──
  contentReviewChat: "aim.content_review.chat",
  contentReviewGenerate: "aim.content_review.generate",
  contentEditorRevise: "aim.content_review.editor_revise",
  // ── 批1：content_retro ──
  contentRetroChat: "aim.content_retro.chat",
  contentRetroGenerate: "aim.content_retro.generate",
  // ── 批1：script_polish ──
  scriptPolishImitateSystem: "aim.script_polish.imitate_system",
  scriptPolishImitateUser: "aim.script_polish.imitate_user",
  scriptPolishProofreadSystem: "aim.script_polish.proofread_system",
  scriptPolishProofreadUser: "aim.script_polish.proofread_user",
  scriptPolishPolishSystem: "aim.script_polish.polish_system",
  scriptPolishPolishUser: "aim.script_polish.polish_user",
  // ── 批1：质量门控 ──
  qualityGateEvaluation: "quality.gate.combined_evaluation",
  qualityGateEvaluationSystem: "quality.gate.evaluation_system",
  qualityGateRewrite: "quality.gate.rewrite",
  qualityGateRewriteSystem: "quality.gate.rewrite_system",
  qualityGateHookRewrite: "quality.gate.hook_rewrite",
  qualityGateOralRewrite: "quality.gate.oral_rewrite",
  qualityGateLogicRewrite: "quality.gate.logic_rewrite",
  qualityGateEditorialRewrite: "quality.gate.editorial_rewrite",
  // ── 批2：API 路由内联 ──
  briefAiFillSystem: "brief.ai_fill.system",
  briefAiFillUserInput: "brief.ai_fill.user_input",
  briefAiFillUserNoInput: "brief.ai_fill.user_no_input",
  knowledgeDistillSystem: "knowledge.distill.system",
  knowledgeDistillUser: "knowledge.distill.user",
  competitorChannelsTopicAnalysis: "competitor.search_channels.topic_analysis",
  competitorChannelsTopicAnalysisUser: "competitor.search_channels.topic_analysis_user",
  // ── 批3：lib 级零散点扫尾 ──
  competitorMethodologyCompile: "competitor.methodology.compile",
  contentRetroOutcomeMissing: "aim.content_retro.outcome_missing",
  contentRetroOutcomePresent: "aim.content_retro.outcome_present",
  workEditorKnowledgeFallback: "aim.work_editor.knowledge_fallback",
  // ── 批4：主创作链（WP-1.2）──
  freeCopywriterSystem: "aim.free_copywriter.system",
  freeCopywriterGenerateUser: "aim.free_copywriter.generate_user",
  businessSystemDiagnosisChat: "aim.business_system_diagnosis.chat",
  businessSystemDiagnosisGenerate: "aim.business_system_diagnosis.generate",
  businessSystemDiagnosisGenerateUser: "aim.business_system_diagnosis.generate_user",
  businessDiagnosisChat: "aim.business_diagnosis.chat",
  businessDiagnosisGenerate: "aim.business_diagnosis.generate",
  businessDiagnosisGenerateUser: "aim.business_diagnosis.generate_user",
  contentProducerChat: "aim.content_producer.chat",
  contentProducerGenerateUser: "aim.content_producer.generate_user",
  generationLayeredSystem: "aim.generation.layered_system",
  unifiedProducerSystem: "aim.unified_content.producer_system",
  unifiedProducerUser: "aim.unified_content.producer_user",
  scriptGenerationMetaSystem: "aim.script_generation.meta_system",
  scriptGenerationMetaUser: "aim.script_generation.meta_user",
  scriptGenerationDirect: "aim.script_generation.direct",
  scriptGenerationMetaText: "aim.script_generation.meta_text",
  // ── 批5：格式指令 / 脚本 system / 闭集事实（WP-1.2 下一刀）──
  formatVideoScript: "aim.format.video_script",
  formatWechatArticle: "aim.format.wechat_article",
  formatMomentsPost: "aim.format.moments_post",
  formatCommunityMessage: "aim.format.community_message",
  formatRawCopy: "aim.format.raw_copy",
  formatShootingBrief: "aim.format.shooting_brief",
  formatXiaohongshuPost: "aim.format.xiaohongshu_post",
  scriptGenerationWithPromptSystem: "aim.script_generation.with_prompt_system",
  scriptGenerationDirectSystem: "aim.script_generation.direct_system",
  scriptGenerationScoringSystem: "aim.script_generation.scoring_system",
  contentProducerClosedSetFacts: "aim.content_producer.closed_set_facts",
} as const

export type PromptKey = (typeof PROMPT_KEYS)[keyof typeof PROMPT_KEYS]

/** 内置兜底 seed（与源码同仓，v1 = 迁移前的逐字原文）。 */
export interface PromptSeed {
  key: string
  domain: string
  description?: string
  /** 内置固定为 1。 */
  version: number
  type: PromptType
  content: PromptContent
  fixtureKey?: string
}

/** 对外返回的 prompt 记录（来源可能是 DB，也可能是内置 seed）。 */
export interface PromptRecord {
  key: string
  version: number
  content: PromptContent
  type: PromptType
  status: PromptStatus
  /** true 表示来自内置 seed（DB 不可用/未命中时的兜底），便于观测。 */
  fromSeed: boolean
}

export interface GetOptions {
  /** 显式指定版本号；优先级最高。 */
  version?: number
  /** 限定状态（单值或数组）；不传则按 active > qualified > draft。 */
  status?: PromptStatus | PromptStatus[]
}

/** 状态优先级：高 → 低。 */
export const STATUS_PRIORITY: readonly PromptStatus[] = ["active", "qualified", "draft"] as const

const KNOWN_TYPES: readonly PromptType[] = ["system", "function", "inline"] as const

/** 未知 type 一律收敛为 system（批0 全为 system）。 */
export function normalizeType(value: string): PromptType {
  return (KNOWN_TYPES as readonly string[]).includes(value) ? (value as PromptType) : "system"
}

/** 未知 status 一律收敛为 draft（最保守，不会自动生效）。 */
export function normalizeStatus(value: string): PromptStatus {
  return value === "active" || value === "qualified" ? value : "draft"
}

/** 同状态内取版本号最大的一条。 */
function maxVersion(list: PromptRecord[]): PromptRecord {
  return list.reduce((acc, cur) => (cur.version > acc.version ? cur : acc))
}

/**
 * 选版纯函数（优先级：显式 version > active > qualified > draft）。
 * @param versions - 该 key 下所有候选版本（可为空）
 * @param opts - 选版条件
 * @returns 命中的记录；无命中返回 null（调用方回落 seed）
 */
export function selectVersion(
  versions: readonly PromptRecord[],
  opts?: GetOptions,
): PromptRecord | null {
  if (!versions || versions.length === 0) return null
  const list: PromptRecord[] = [...versions]

  if (typeof opts?.version === "number") {
    const exact = list.filter((v) => v.version === opts.version)
    if (exact.length === 0) return null
    // 同一 version 若存在多状态行，仍按状态优先级收敛
    return pickByStatusPriority(exact)
  }

  if (opts?.status) {
    const wanted: PromptStatus[] = Array.isArray(opts.status) ? opts.status : [opts.status]
    const filtered = list.filter((v) => wanted.includes(v.status))
    if (filtered.length === 0) return null
    return pickByStatusPriority(filtered)
  }

  return pickByStatusPriority(list)
}

/** 按 active > qualified > draft 取；未知状态按 draft 处理；同状态取最大版本。 */
function pickByStatusPriority(list: PromptRecord[]): PromptRecord {
  for (const status of STATUS_PRIORITY) {
    const candidates = list.filter((v) => v.status === status)
    if (candidates.length > 0) return maxVersion(candidates)
  }
  // 全部是未知状态（已 normalize 不会发生），退化为取最大版本
  return maxVersion(list)
}

/** seed → 记录（status 固定 draft，fromSeed=true）。 */
export function seedToRecord(seed: PromptSeed): PromptRecord {
  return {
    key: seed.key,
    version: seed.version,
    content: seed.content,
    type: seed.type,
    status: "draft",
    fromSeed: true,
  }
}

// ── P1 评估挂接：升级门禁 ─────────────────────────────────────────────────

/** 升级请求：从某状态迁往某状态，携带该版本的 fixtureKey（若有）。 */
export interface PromptPromotionInput {
  fromStatus: PromptStatus
  toStatus: PromptStatus
  fixtureKey?: string | null
}

export interface PromptPromotionCheck {
  allowed: boolean
  reason?: string
}

/**
 * 升级门禁纯函数（P1：无 fixtureKey 禁止升 qualified）。
 *
 * 规则：
 * - → qualified：必须绑定评测 fixtureKey（PromptVersion.fixtureKey → EvalFixtureVersion），
 *   「评测通过」是 qualified 的存在前提。
 * - → active：只能从 qualified 升入（未经评测的版本不得直接生效）。
 * - → draft：任意状态可回落（回滚语义）。
 * - 同状态 / 未定义迁移：拒绝。
 *
 * 注：本函数只做规则判定；EvalFixtureVersion 是否真实存在由调用方
 * （未来的管理接口/脚本）在落库前另行校验。
 */
export function checkPromptPromotion(input: PromptPromotionInput): PromptPromotionCheck {
  if (input.fromStatus === input.toStatus) {
    return { allowed: false, reason: "状态未变化" }
  }
  if (input.toStatus === "qualified") {
    if (!input.fixtureKey || !input.fixtureKey.trim()) {
      return {
        allowed: false,
        reason: "升 qualified 必须绑定评测 fixtureKey（EvalFixtureVersion），未评测的 prompt 不得转正式",
      }
    }
    return { allowed: true }
  }
  if (input.toStatus === "active") {
    if (input.fromStatus !== "qualified") {
      return { allowed: false, reason: "只能从 qualified 升 active：未经评测的版本不得直接生效" }
    }
    return { allowed: true }
  }
  if (input.toStatus === "draft") {
    return { allowed: true }
  }
  return { allowed: false, reason: "不支持的状态迁移" }
}
