import { listIpWikiPages, type IpWikiPageRow } from "@/lib/ip-wiki/repo"
import {
  IP_WIKI_CORE_PAGE_TYPES,
  IP_WIKI_PAGE_TYPE_LABELS,
  type IpWikiPageType,
} from "@/lib/ip-wiki/types"
import { prisma } from "@/lib/prisma"

/**
 * IP 定位维基 · 查询层（Query）
 *
 * Karpathy LLM-Wiki 模式的「查询」步骤：把某 IP 营销全案「已编译并人工确认」的维基页，
 * 格式化成一段稳定的全局定位上下文，供下游内容生产官 / 作品编辑在生成内容时直接读取——
 * 下游不必每次 JIT 向量检索散落的定位碎片，而是读取这份提前编译（AOT）的定位底盘。
 *
 * 这一步只读取 active 页（archived 历史页不参与），不落库、不联网。
 */

export interface IpWikiBlockInput {
  /** IP 营销全案 id；无值时返回空串（注入端可据此跳过） */
  projectId?: string
}

/** 仅取与下游内容生产最相关的核心页，避免 index/log 等导航页污染 prompt */
// 这里只允许装配带 projectId 的客户专属页。
// viral_methodology 是历史类型名，在 IP Wiki 中表示“针对当前客户适配后的项目爆款策略”，
// 不是全局方法论源；全局方法论仍通过独立 methodologyBlock 注入。
const BLOCK_PAGE_TYPES = [...IP_WIKI_CORE_PAGE_TYPES, "viral_methodology" as IpWikiPageType]

const MAX_PAGES_IN_BLOCK = 8
/**
 * 档案块总预算：与统一上下文预算的 ipWikiBlock 上限对齐。
 * 修复（2026-09）：此前每页截 1200 字、6 页上限，前几页吃光 3000 字预算后
 * 排在后面的成交路径（卖点）/人设被整段砍掉，导致成稿体现不出卖点与 IP 特点。
 * 现改为块内公平分页：每页保底字数 + 按页数均分，七类档案页都在场。
 */
const MAX_BLOCK_TOTAL_CHARS = 3_000
const MIN_PAGE_CHARS = 200

/**
 * @description 构建ipwikiblock
 * @param input - 输入数据
 * @returns Promise<string>
 */
export async function buildIpWikiBlock(input: IpWikiBlockInput): Promise<string> {
  if (!input.projectId) return ""
  const pages = await listIpWikiPages({
    projectId: input.projectId,
    pageTypes: BLOCK_PAGE_TYPES,
  })
  if (pages.length === 0) {
    // IP Wiki 尚未编译时，从项目知识库中构建定位回退上下文
    return buildFallbackPositioningBlock(input.projectId)
  }
  return formatIpWikiBlock(pages)
}

/** IP 核心定位相关的知识分类（用于 Wiki 为空时的回退召回） */
const FALLBACK_POSITIONING_CATEGORIES = [
  "positioning_material",
  "boss_experience",
  "product_usp",
  "customer_pain",
  "user_insight",
  "private_domain_material",
]

const FALLBACK_MAX_ENTRIES = 8
const FALLBACK_MAX_ENTRY_CHARS = 600

const FALLBACK_CATEGORY_ORDER = [
  "positioning_material",
  "product_usp",
  "boss_experience",
  "customer_pain",
  "user_insight",
  "private_domain_material",
]

type FallbackPositioningEntry = {
  title: string
  content: string
  category: string
  valueGrade?: string | null
  sortOrder?: number
}

function fallbackCategoryRank(category: string): number {
  const index = FALLBACK_CATEGORY_ORDER.indexOf(category)
  return index === -1 ? FALLBACK_CATEGORY_ORDER.length : index
}

function fallbackGradeRank(valueGrade?: string | null): number {
  return ({ S: 0, A: 1, B: 2, C: 3 } as Record<string, number>)[valueGrade ?? "B"] ?? 2
}

/**
 * Wiki 尚未编译时，仍以定位底盘优先级而不是数据库字母序选择资料。
 */
export function formatFallbackPositioningBlock(entries: FallbackPositioningEntry[]): string {
  const selected = [...entries]
    .sort((a, b) =>
      fallbackCategoryRank(a.category) - fallbackCategoryRank(b.category)
      || fallbackGradeRank(a.valueGrade) - fallbackGradeRank(b.valueGrade)
      || (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    )
    .slice(0, FALLBACK_MAX_ENTRIES)

  if (selected.length === 0) return ""

  return [
    "=== IP 定位上下文（知识库回退，IP Wiki 尚未编译）===",
    "以下资料用于锁定业务定位、服务对象、价值主张和转化承接；不要把它们当作互不相关的灵感。",
    "",
    ...selected.map((entry) => `- ${entry.title}：${entry.content.trim().slice(0, FALLBACK_MAX_ENTRY_CHARS)}`),
  ].join("\n")
}

/**
 * IP Wiki 为空时的回退：从项目知识库中拉取定位相关条目，
 * 构建一个最小化的定位上下文块，确保 IP 核心定位信息不会因 Wiki 未编译而完全缺失。
 */
async function buildFallbackPositioningBlock(projectId: string): Promise<string> {
  try {
    const entries = await prisma.knowledgeEntry.findMany({
      where: {
        projectId,
        status: "active",
        category: { in: FALLBACK_POSITIONING_CATEGORIES },
      },
      // 先取足候选，再在内存按业务优先级稳定排序；不能用类别字母序代替定位优先级。
      take: 40,
      select: { title: true, content: true, category: true, valueGrade: true, sortOrder: true },
    })
    return formatFallbackPositioningBlock(entries)
  } catch {
    // 回退失败不阻塞主流程
    return ""
  }
}

/** 按核心页固定阅读顺序排序，content_strategy（底盘）紧跟 positioning 之后 */
function sortPagesForBlock(pages: IpWikiPageRow[]): IpWikiPageRow[] {
  const orderRank = new Map<IpWikiPageType, number>()
  BLOCK_PAGE_TYPES.forEach((t, i) => orderRank.set(t, i))
  return [...pages].sort((a, b) => {
    const ra = orderRank.get(a.pageType) ?? 99
    const rb = orderRank.get(b.pageType) ?? 99
    return ra - rb
  })
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 把 content_strategy 页的六个必填字段渲染成可执行策略摘要 */
function formatStrategyFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = []

  const topicDist = asArray(fm.topicDistribution)
    .map((item) => {
      const r = asRecord(item)
      const topic = typeof r.topic === "string" ? r.topic : ""
      const pct = typeof r.percentage === "number" ? r.percentage : undefined
      return pct !== undefined ? `${topic} ${pct}%` : topic
    })
    .filter(Boolean)
  if (topicDist.length) lines.push(`- 话题分布：${topicDist.join("、")}`)

  const formats = asArray(fm.contentFormats)
    .map((item) => {
      const r = asRecord(item)
      const format = typeof r.format === "string" ? r.format : ""
      const pct = typeof r.percentage === "number" ? r.percentage : undefined
      return pct !== undefined ? `${format} ${pct}%` : format
    })
    .filter(Boolean)
  if (formats.length) lines.push(`- 内容形式：${formats.join("、")}`)

  const hooks = asArray(fm.hookPatterns)
    .map((v) => (typeof v === "string" ? v : ""))
    .filter(Boolean)
  if (hooks.length) lines.push(`- 钩子模式：${hooks.join("、")}`)

  if (typeof fm.postingFrequency === "string" && fm.postingFrequency.trim()) {
    lines.push(`- 发布频率：${fm.postingFrequency.trim()}`)
  }
  if (typeof fm.bestPostingTimes === "string" && fm.bestPostingTimes.trim()) {
    lines.push(`- 最佳时段：${fm.bestPostingTimes.trim()}`)
  }
  if (typeof fm.viralFormula === "string" && fm.viralFormula.trim()) {
    lines.push(`- 爆款公式：${fm.viralFormula.trim()}`)
  }

  return lines.join("\n")
}

/**
 * 纯函数：把维基页行渲染成注入用文本块。导出以便单测，
 * 不依赖 Prisma。
 */
/**
 * @description 格式化ipwikiblock
 * @param pages - pages
 * @returns string
 */
export function formatIpWikiBlock(pages: IpWikiPageRow[]): string {
  const coreOnly = pages.filter((p) => (BLOCK_PAGE_TYPES as string[]).includes(p.pageType))
  const ordered = sortPagesForBlock(coreOnly).slice(0, MAX_PAGES_IN_BLOCK)
  if (ordered.length === 0) return ""

  // 块内公平分页：预留标题/策略行开销后按页均分正文预算，每页保底 MIN_PAGE_CHARS
  const perPageCap = Math.max(
    MIN_PAGE_CHARS,
    Math.floor((MAX_BLOCK_TOTAL_CHARS - 700) / ordered.length),
  )

  const sections = ordered.map((page) => {
    const label = page.pageType === "viral_methodology"
      ? "项目爆款策略（客户专属）"
      : IP_WIKI_PAGE_TYPE_LABELS[page.pageType] ?? page.pageType
    const header = `【${label}】${page.title}`.trim()
    const body = page.content.trim().slice(0, perPageCap)
    const strategy =
      page.pageType === "content_strategy"
        ? formatStrategyFrontmatter(asRecord(page.frontmatter))
        : ""
    return [header, strategy, body].filter(Boolean).join("\n")
  })

  const block = [
    "=== IP 定位维基（已编译定位底盘，生成内容时必须以此为准）===",
    "",
    sections.join("\n\n"),
  ].join("\n")
  return block.length > MAX_BLOCK_TOTAL_CHARS ? block.slice(0, MAX_BLOCK_TOTAL_CHARS) : block
}

/**
 * 合规校验用：加载 IP 操盘案六页核心结构化数据，按 pageType 做索引。
 * projectId 缺失时返回空对象（下游判断 ipWikiPages === undefined 或空都跳过）。
 */
export async function loadIpWikiPagesIndexed(input: {
  projectId?: string
}): Promise<Partial<Record<IpWikiPageType, IpWikiPageRow>>> {
  if (!input.projectId) return {}
  const rows = await listIpWikiPages({
    projectId: input.projectId,
    pageTypes: IP_WIKI_CORE_PAGE_TYPES,
  })
  const index: Partial<Record<IpWikiPageType, IpWikiPageRow>> = {}
  for (const r of rows) {
    if (!index[r.pageType]) index[r.pageType] = r
  }
  return index
}
