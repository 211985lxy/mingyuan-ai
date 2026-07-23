/**
 * 计划模式 · 档案驱动选项生成引擎（无状态）
 *
 * 读取当前客户项目的 IP Wiki 页和知识库条目，为每个计划维度提取
 * 最多 3 个有来源的推荐选项。不使用通用模型建议填充缺少档案依据的选项。
 */

import { prisma } from "@/lib/prisma"
import { listIpWikiPages, type IpWikiPageRow } from "@/lib/ip-wiki/repo"
import {
  IP_WIKI_PAGE_TYPE_LABELS,
  type IpWikiPageType,
} from "@/lib/ip-wiki/types"
import {
  PLAN_DIMENSION_ORDER,
  PLAN_MAX_QUESTIONS_PER_ROUND,
  PLAN_MAX_TOTAL_QUESTIONS,
  PLAN_MIN_ARCHIVE_OPTIONS,
  type PlanAssumption,
  type PlanOptionSourceRef,
  type PlanQuestion,
  type PlanQuestionDimension,
  type PlanResponse,
  type PlanTaskSpec,
  type PlanTaskSpecField,
} from "@/lib/aim/plan-types"

// ─── 知识分类标签映射 ───

const KNOWLEDGE_CATEGORY_LABELS: Record<string, string> = {
  boss_experience: "老板经历",
  product_usp: "产品卖点",
  customer_pain: "客户痛点",
  project_case: "项目案例",
  customer_qa: "客户问答",
  user_insight: "用户洞察",
  positioning_material: "定位素材",
  private_domain_material: "私域素材",
  hot_topic: "热点素材",
  benchmark_reference: "对标参考",
}

// ─── 维度 → 数据来源映射 ───

interface DimensionSourceConfig {
  /** 从哪些 IP Wiki pageType 提取 */
  wikiPageTypes: IpWikiPageType[]
  /** 从哪些知识分类提取 */
  knowledgeCategories: string[]
  /** 对应任务单字段 */
  targetField: PlanTaskSpecField
  /** 问题模板 */
  promptTemplate: string
}

const DIMENSION_SOURCES: Record<PlanQuestionDimension, DimensionSourceConfig> = {
  goal_and_message: {
    wikiPageTypes: ["positioning", "topic_direction", "content_strategy"],
    knowledgeCategories: ["positioning_material", "product_usp"],
    targetField: "coreMessage",
    promptTemplate: "这条内容最核心要传达的信息是什么？",
  },
  audience_and_pain: {
    wikiPageTypes: ["audience", "positioning"],
    knowledgeCategories: ["customer_pain", "customer_qa", "user_insight"],
    targetField: "realProblem",
    promptTemplate: "主要面向哪类客户？他们最痛的问题是什么？",
  },
  scenario_format: {
    wikiPageTypes: ["content_strategy", "topic_direction"],
    knowledgeCategories: ["benchmark_reference"],
    targetField: "outputFormat",
    promptTemplate: "内容用在什么场景？需要什么格式？",
  },
  style_length: {
    wikiPageTypes: ["persona", "content_strategy"],
    knowledgeCategories: ["boss_experience"],
    targetField: "style",
    promptTemplate: "希望用什么风格和长度？",
  },
  cta: {
    wikiPageTypes: ["conversion_path"],
    knowledgeCategories: ["product_usp", "private_domain_material"],
    targetField: "ctaText",
    promptTemplate: "内容结尾希望引导读者做什么？",
  },
}

// ─── 提取的原始素材 ───

interface ExtractedSnippet {
  text: string
  sourceRef: PlanOptionSourceRef
}

/** 从 Wiki 页内容中提取有意义的片段（按段落/要点拆分） */
function extractSnippetsFromWikiPage(page: IpWikiPageRow, maxSnippets: number): ExtractedSnippet[] {
  const label = `${IP_WIKI_PAGE_TYPE_LABELS[page.pageType] ?? page.pageType} Wiki`
  const lines = page.content
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*\d.]+\s*/, "").trim())
    .filter((line) => line.length >= 6 && line.length <= 120)

  return lines.slice(0, maxSnippets).map((text) => ({
    text,
    sourceRef: { kind: "ip_wiki" as const, id: page.id, label },
  }))
}

/** 从知识条目中提取片段 */
function extractSnippetsFromKnowledge(
  entry: { id: string; title: string; content: string; category: string },
  maxSnippets: number,
): ExtractedSnippet[] {
  const label = `${KNOWLEDGE_CATEGORY_LABELS[entry.category] ?? entry.category}条目`
  const candidates = [
    entry.title.trim(),
    ...entry.content.split(/\n+/).map((l) => l.trim()).filter((l) => l.length >= 6 && l.length <= 120),
  ].filter(Boolean)

  return candidates.slice(0, maxSnippets).map((text) => ({
    text,
    sourceRef: { kind: "knowledge" as const, id: entry.id, label },
  }))
}

// ─── 核心引擎 ───

interface PlanEngineInput {
  projectId: string
  userId: string
  requirement: string
  confirmedFields: Partial<PlanTaskSpec>
  answeredQuestionIds: string[]
  round: number
  totalQuestionsAsked: number
}

/**
 * 档案驱动选项生成主函数（无状态、纯服务端）。
 *
 * 1. 并行加载 IP Wiki 页 + 知识条目
 * 2. 按维度优先级遍历，跳过已有明确答案的字段
 * 3. 每个维度提取选项，丢弃无来源的
 * 4. 选项 >= 2 → 生成问题；< 2 → 跳过（不用通用答案凑数）
 * 5. 最多返回 3 个问题，总问题数不超过 5
 */
export async function generatePlanQuestions(input: PlanEngineInput): Promise<PlanResponse> {
  const { projectId, userId, confirmedFields, round, totalQuestionsAsked } = input

  // 1. 并行加载档案数据
  const [wikiPages, knowledgeEntries, project] = await Promise.all([
    listIpWikiPages({ projectId }),
    prisma.knowledgeEntry.findMany({
      where: { projectId, userId, status: "active" },
      select: { id: true, title: true, content: true, category: true },
      take: 60,
    }),
    prisma.clientProject.findFirst({
      where: { id: projectId, userId },
      select: { id: true, name: true, targetCustomer: true, industry: true, offer: true, deliveryGoal: true },
    }),
  ])

  const { assumptions, assumedFields } = buildProjectAssumptions(project)
  const questions = buildPlanQuestions({ confirmedFields, assumedFields, wikiPages, knowledgeEntries, round, totalQuestionsAsked })

  // 4. 构建当前任务单快照
  const taskSpec: Partial<PlanTaskSpec> = { ...confirmedFields }
  for (const assumption of assumptions) {
    if (!taskSpec[assumption.field]) {
      taskSpec[assumption.field] = assumption.value
    }
  }

  const newTotalAsked = totalQuestionsAsked + questions.length
  const ready = questions.length === 0 || newTotalAsked >= PLAN_MAX_TOTAL_QUESTIONS

  return {
    round,
    ready,
    questions,
    assumptions,
    taskSpec,
    totalQuestionsAsked: newTotalAsked,
  }
}

function buildProjectAssumptions(project: {
  targetCustomer: string | null
  offer: string | null
} | null): { assumptions: PlanAssumption[]; assumedFields: Set<PlanTaskSpecField> } {
  const assumptions: PlanAssumption[] = []
  const assumedFields = new Set<PlanTaskSpecField>()
  if (project?.targetCustomer?.trim()) {
    assumptions.push({ field: "targetCustomer", value: project.targetCustomer.trim(), sourceRefs: [{ kind: "project", id: "targetCustomer", label: "项目-目标客户" }] })
    assumedFields.add("targetCustomer")
  }
  if (project?.offer?.trim()) {
    assumptions.push({ field: "coreMessage", value: project.offer.trim(), sourceRefs: [{ kind: "project", id: "offer", label: "项目-主推产品/服务" }] })
    assumedFields.add("coreMessage")
  }
  return { assumptions, assumedFields }
}

function buildPlanQuestions({ confirmedFields, assumedFields, wikiPages, knowledgeEntries, round, totalQuestionsAsked }: {
  confirmedFields: Partial<PlanTaskSpec>
  assumedFields: Set<PlanTaskSpecField>
  wikiPages: IpWikiPageRow[]
  knowledgeEntries: Array<{ id: string; title: string; content: string; category: string }>
  round: number
  totalQuestionsAsked: number
}): PlanQuestion[] {
  const questions: PlanQuestion[] = []
  const remainingSlots = Math.min(PLAN_MAX_QUESTIONS_PER_ROUND, PLAN_MAX_TOTAL_QUESTIONS - totalQuestionsAsked)
  for (const dimension of PLAN_DIMENSION_ORDER) {
    if (questions.length >= remainingSlots) break
    const config = DIMENSION_SOURCES[dimension]
    if (confirmedFields[config.targetField] || assumedFields.has(config.targetField)) continue
    const snippets = deduplicateSnippets(extractDimensionSnippets(dimension, wikiPages, knowledgeEntries)).slice(0, 3)
    if (snippets.length < PLAN_MIN_ARCHIVE_OPTIONS) continue
    questions.push({
      id: `q_${dimension}_r${round}_${Date.now().toString(36)}`,
      dimension,
      prompt: config.promptTemplate,
      options: snippets.map((snippet, index) => ({ key: (["A", "B", "C"] as const)[index], text: snippet.text, sourceRefs: [snippet.sourceRef] })),
      hasCustomOption: true,
      targetField: config.targetField,
    })
  }
  return questions
}

/** 按维度配置提取选项素材 */
function extractDimensionSnippets(
  dimension: PlanQuestionDimension,
  wikiPages: IpWikiPageRow[],
  knowledgeEntries: Array<{ id: string; title: string; content: string; category: string }>,
): ExtractedSnippet[] {
  const config = DIMENSION_SOURCES[dimension]
  const snippets: ExtractedSnippet[] = []

  // 从 IP Wiki 页提取
  for (const page of wikiPages) {
    if (!config.wikiPageTypes.includes(page.pageType)) continue
    snippets.push(...extractSnippetsFromWikiPage(page, 4))
  }

  // 从知识条目提取
  for (const entry of knowledgeEntries) {
    if (!config.knowledgeCategories.includes(entry.category)) continue
    snippets.push(...extractSnippetsFromKnowledge(entry, 2))
  }

  return snippets
}

/** 去重：相同文本只保留第一个 */
function deduplicateSnippets(snippets: ExtractedSnippet[]): ExtractedSnippet[] {
  const seen = new Set<string>()
  return snippets.filter((s) => {
    const normalized = s.text.trim().toLowerCase()
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}
