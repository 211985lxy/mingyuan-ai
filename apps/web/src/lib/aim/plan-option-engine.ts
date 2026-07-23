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
  /** 参与选项生成的项目档案字段 */
  projectFields?: Array<keyof ProjectPlanProfile>
  /** 同一知识类型内的轻量重排提示 */
  relevanceHints: string[]
}

const DIMENSION_SOURCES: Record<PlanQuestionDimension, DimensionSourceConfig> = {
  core_message: {
    wikiPageTypes: ["positioning", "topic_direction", "content_strategy"],
    knowledgeCategories: ["positioning_material", "product_usp"],
    targetField: "coreMessage",
    promptTemplate: "这条内容最核心要传达的信息是什么？",
    projectFields: ["offer"],
    relevanceHints: ["核心主张", "价值承诺", "产品服务", "差异化", "定位"],
  },
  audience: {
    wikiPageTypes: ["audience", "positioning"],
    knowledgeCategories: ["user_insight", "customer_pain"],
    targetField: "targetCustomer",
    promptTemplate: "这条内容主要说给哪类人听？",
    projectFields: ["targetCustomer"],
    relevanceHints: ["目标客户", "目标人群", "受众", "老板", "创业者"],
  },
  pain: {
    wikiPageTypes: ["audience", "positioning", "content_strategy"],
    knowledgeCategories: ["customer_pain", "customer_qa", "user_insight"],
    targetField: "realProblem",
    promptTemplate: "这次最值得击中的真实痛点是什么？",
    relevanceHints: ["痛点", "难题", "焦虑", "卡点", "困境"],
  },
  platform: {
    wikiPageTypes: ["content_strategy", "topic_direction"],
    knowledgeCategories: ["benchmark_reference", "hot_topic"],
    targetField: "platform",
    promptTemplate: "这条内容准备发布到哪个平台？",
    relevanceHints: ["抖音", "视频号", "小红书", "朋友圈", "公众号", "平台"],
  },
  scenario: {
    wikiPageTypes: ["content_strategy", "conversion_path"],
    knowledgeCategories: ["private_domain_material", "project_case"],
    targetField: "useScenario",
    promptTemplate: "这条内容会用在什么具体场景？",
    relevanceHints: ["发布", "私域", "朋友圈", "直播", "投放", "咨询"],
  },
  format: {
    wikiPageTypes: ["content_strategy", "topic_direction"],
    knowledgeCategories: ["benchmark_reference"],
    targetField: "outputFormat",
    promptTemplate: "这次最合适的内容形式是什么？",
    relevanceHints: ["短视频", "口播", "图文", "长文", "脚本", "形式"],
  },
  style: {
    wikiPageTypes: ["persona", "content_strategy"],
    knowledgeCategories: ["boss_experience", "benchmark_reference"],
    targetField: "style",
    promptTemplate: "这条内容应该采用什么表达风格？",
    relevanceHints: ["口吻", "语气", "风格", "表达", "人设"],
  },
  length: {
    wikiPageTypes: ["content_strategy", "viral_methodology"],
    knowledgeCategories: ["benchmark_reference"],
    targetField: "lengthRule",
    promptTemplate: "这条内容控制在什么长度？",
    relevanceHints: ["字数", "时长", "秒", "分钟", "篇幅"],
  },
  cta: {
    wikiPageTypes: ["conversion_path"],
    knowledgeCategories: ["product_usp", "private_domain_material"],
    targetField: "ctaText",
    promptTemplate: "内容结尾希望引导读者做什么？",
    projectFields: ["deliveryGoal"],
    relevanceHints: ["私信", "评论", "咨询", "预约", "领取", "成交"],
  },
}

// ─── 提取的原始素材 ───

interface ProjectPlanProfile {
  targetCustomer: string | null
  offer: string | null
  deliveryGoal: string | null
}

interface ExtractedSnippet {
  text: string
  sourceRef: PlanOptionSourceRef
}

/** 从 Wiki 页内容中提取有意义的片段（按段落/要点拆分） */
function extractSnippetsFromWikiPage(page: IpWikiPageRow, maxSnippets: number): ExtractedSnippet[] {
  const label = `${IP_WIKI_PAGE_TYPE_LABELS[page.pageType] ?? page.pageType} Wiki`
  const lines = page.content
    .split(/\n+/)
    .map(normalizeSnippetText)
    .filter((line) => line.length >= 6 && line.length <= 180)

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
    normalizeSnippetText(entry.title),
    ...entry.content.split(/\n+/).map(normalizeSnippetText).filter((line) => line.length >= 6 && line.length <= 180),
  ].filter((text) => text.length >= 6)

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
 * 4. 选项 >= 2 → 生成 A/B/C；< 2 → 保留问题但只提供 D 自定义
 * 5. 最多返回 3 个问题，总问题数不超过 6
 */
export async function generatePlanQuestions(input: PlanEngineInput): Promise<PlanResponse> {
  const { projectId, userId, round, totalQuestionsAsked } = input

  // 1. 并行加载档案数据
  const [wikiPages, knowledgeEntries, project] = await Promise.all([
    listIpWikiPages({ projectId }),
    prisma.knowledgeEntry.findMany({
      where: { projectId, userId, status: "active" },
      select: { id: true, title: true, content: true, category: true },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      take: 120,
    }),
    prisma.clientProject.findFirst({
      where: { id: projectId, userId },
      select: { id: true, name: true, targetCustomer: true, industry: true, offer: true, deliveryGoal: true },
    }),
  ])

  const confirmedFields = { ...extractRequirementFields(input.requirement), ...input.confirmedFields }
  const { assumptions, assumedFields } = buildProjectAssumptions(project)
  const questions = buildPlanQuestions({
    requirement: input.requirement,
    confirmedFields,
    assumedFields,
    wikiPages,
    knowledgeEntries,
    project,
    round,
    totalQuestionsAsked,
  })

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

function buildProjectAssumptions(project: ProjectPlanProfile | null): {
  assumptions: PlanAssumption[]
  assumedFields: Set<PlanTaskSpecField>
} {
  const assumptions: PlanAssumption[] = []
  const assumedFields = new Set<PlanTaskSpecField>()
  if (project?.targetCustomer?.trim()) {
    assumptions.push({ field: "targetCustomer", value: project.targetCustomer.trim(), sourceRefs: [{ kind: "project", id: "targetCustomer", label: "项目-目标客户" }] })
    assumedFields.add("targetCustomer")
  }
  return { assumptions, assumedFields }
}

function buildPlanQuestions({ requirement, confirmedFields, assumedFields, wikiPages, knowledgeEntries, project, round, totalQuestionsAsked }: {
  requirement: string
  confirmedFields: Partial<PlanTaskSpec>
  assumedFields: Set<PlanTaskSpecField>
  wikiPages: IpWikiPageRow[]
  knowledgeEntries: Array<{ id: string; title: string; content: string; category: string }>
  project: ProjectPlanProfile | null
  round: number
  totalQuestionsAsked: number
}): PlanQuestion[] {
  const questions: PlanQuestion[] = []
  const remainingSlots = Math.min(PLAN_MAX_QUESTIONS_PER_ROUND, PLAN_MAX_TOTAL_QUESTIONS - totalQuestionsAsked)
  for (const dimension of PLAN_DIMENSION_ORDER) {
    if (questions.length >= remainingSlots) break
    const config = DIMENSION_SOURCES[dimension]
    if (confirmedFields[config.targetField] || assumedFields.has(config.targetField)) continue
    const snippets = rankSnippetsForRequirement(
      extractDimensionSnippets(dimension, wikiPages, knowledgeEntries, project),
      requirement,
      config.relevanceHints,
    ).slice(0, 3)
    const reliableOptions = snippets.length >= PLAN_MIN_ARCHIVE_OPTIONS ? snippets : []
    questions.push({
      id: `q_${dimension}_r${round}_${Date.now().toString(36)}`,
      dimension,
      prompt: config.promptTemplate,
      options: reliableOptions.map((snippet, index) => ({ key: (["A", "B", "C"] as const)[index], text: snippet.text, sourceRefs: [snippet.sourceRef] })),
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
  project: ProjectPlanProfile | null,
): ExtractedSnippet[] {
  const config = DIMENSION_SOURCES[dimension]
  const snippets: ExtractedSnippet[] = []

  // 从 IP Wiki 页提取
  for (const page of wikiPages) {
    if (!config.wikiPageTypes.includes(page.pageType)) continue
    snippets.push(...extractSnippetsFromWikiPage(page, 12))
  }

  // 从知识条目提取
  for (const entry of knowledgeEntries) {
    if (!config.knowledgeCategories.includes(entry.category)) continue
    snippets.push(...extractSnippetsFromKnowledge(entry, 6))
  }

  for (const field of config.projectFields ?? []) {
    const value = project?.[field]?.trim()
    if (!value) continue
    const labels: Record<keyof ProjectPlanProfile, string> = {
      targetCustomer: "项目-目标客户",
      offer: "项目-主推产品/服务",
      deliveryGoal: "项目-交付目标",
    }
    snippets.push({
      text: value,
      sourceRef: { kind: "project", id: field, label: labels[field] },
    })
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

function normalizeSnippetText(text: string): string {
  return text
    .replace(/^#{1,6}\s*/, "")
    .replace(/^[-•*]\s+/, "")
    .replace(/^\d+[.)、]\s*/, "")
    .replace(/\*\*/g, "")
    .trim()
}

function rankSnippetsForRequirement(
  snippets: ExtractedSnippet[],
  requirement: string,
  relevanceHints: string[],
): ExtractedSnippet[] {
  const queryTerms = extractMatchTerms(requirement)
  const hintTerms = extractMatchTerms(relevanceHints.join(" "))
  return deduplicateSnippets(snippets)
    .map((snippet, index) => {
      const normalized = snippet.text.toLowerCase()
      const queryScore = queryTerms.reduce((score, term) => score + (normalized.includes(term) ? Math.min(term.length, 6) * 4 : 0), 0)
      const hintScore = hintTerms.reduce((score, term) => score + (normalized.includes(term) ? Math.min(term.length, 4) : 0), 0)
      const sourceScore = snippet.sourceRef.kind === "project" ? 3 : snippet.sourceRef.kind === "ip_wiki" ? 2 : 1
      return { snippet, index, score: queryScore + hintScore + sourceScore }
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ snippet }) => snippet)
}

function extractMatchTerms(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^\p{Script=Han}a-z0-9]+/gu, " ")
  const stopTerms = new Set(["一个", "一条", "帮我", "这条", "内容", "文案", "生成", "需要", "希望", "怎么", "什么"])
  const terms = new Set<string>()
  for (const segment of normalized.match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu) ?? []) {
    if (!stopTerms.has(segment)) terms.add(segment)
    if (/^[\p{Script=Han}]+$/u.test(segment)) {
      for (let index = 0; index < segment.length - 1; index += 1) {
        const term = segment.slice(index, index + 2)
        if (!stopTerms.has(term)) terms.add(term)
      }
    }
  }
  return [...terms]
}

function extractRequirementFields(requirement: string): Partial<PlanTaskSpec> {
  const fields: Partial<PlanTaskSpec> = { contentGoal: requirement.slice(0, 500) }
  const platforms = ["抖音", "视频号", "小红书", "朋友圈", "公众号", "微博", "快手", "B站", "知乎", "LinkedIn"]
    .filter((platform) => requirement.toLowerCase().includes(platform.toLowerCase()))
  if (platforms.length) fields.platform = platforms.join("、")

  const formats = ["短视频", "口播", "朋友圈文案", "公众号文章", "长文", "图文", "直播脚本", "销售页", "标题"]
    .filter((format) => requirement.includes(format))
  if (formats.length) fields.outputFormat = formats.join("、")

  const lengthRule = requirement.match(/\d{1,4}\s*(?:字|秒|分钟)/)?.[0]
  if (lengthRule) fields.lengthRule = lengthRule.replace(/\s+/g, "")

  const styles = ["专业", "口语化", "犀利", "温暖", "幽默", "克制", "真诚", "高端", "接地气"]
    .filter((style) => requirement.includes(style))
  if (styles.length) fields.style = styles.join("、")

  const scenario = requirement.match(/(?:用于|用在|发布到|发在)([^，。；\n]{2,30})/)?.[1]?.trim()
  if (scenario) fields.useScenario = scenario
  return fields
}
