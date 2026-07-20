/**
 * IP 定位维基 · 共享类型
 *
 * 每个 IP 营销全案（ClientProject）一个「活体维基」，由若干结构化页组成。
 * 页类型对照定位策划官的定位方案输出结构 + Karpathy LLM-Wiki 的 index/log 导航页。
 */

export type IpWikiPageType =
  | "positioning" // 定位主张：Slogan + 受众 + 价值承诺
  | "persona" // 人设：角色 / 标签 / 价值锚点 / 口头禅
  | "content_strategy" // 内容策略底盘：话题分布 / 形式 / 钩子 / 频率 / 时段 / 爆款公式
  | "audience" // 目标人群画像
  | "conversion_path" // 成交路径与产品阶梯
  | "topic_direction" // 选题方向
  | "viral_methodology" // 爆款方法论：爆款结构 / 钩子 / 情绪曲线
  | "index" // 维基目录（导航入口）
  | "log" // 操作日志（时序记录）

export const IP_WIKI_PAGE_TYPES: IpWikiPageType[] = [
  "positioning",
  "persona",
  "content_strategy",
  "audience",
  "conversion_path",
  "topic_direction",
  "viral_methodology",
  "index",
  "log",
]

/**
 * @description 判断是否ipwikipagetype
 * @param value - 值
 * @returns value is IpWikiPageType
 */
export function isIpWikiPageType(value: unknown): value is IpWikiPageType {
  return typeof value === "string" && (IP_WIKI_PAGE_TYPES as string[]).includes(value)
}

export const IP_WIKI_PAGE_TYPE_LABELS: Record<IpWikiPageType, string> = {
  positioning: "定位主张",
  persona: "人设",
  content_strategy: "内容策略底盘",
  audience: "目标人群",
  conversion_path: "成交路径",
  topic_direction: "选题方向",
  viral_methodology: "爆款方法论",
  index: "维基目录",
  log: "操作日志",
}

export const IP_WIKI_CORE_PAGE_TYPES: IpWikiPageType[] = [
  "positioning",
  "persona",
  "content_strategy",
  "audience",
  "conversion_path",
  "topic_direction",
]

export interface IpWikiSourceRef {
  kind: "aim_generation" | "knowledge_entry"
  id: string
  label?: string
}

/** 数据库行的最小形状（供 context/lint 使用，避免耦合 Prisma 类型） */
export interface IpWikiPageRecord {
  id: string
  projectId: string
  pageType: IpWikiPageType
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: IpWikiSourceRef[]
  links: string[]
  version: number
  status: string
  updatedAt: string
}
