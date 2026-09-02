import type { IpWikiPageType } from "@/lib/ip-wiki/types"

/**
 * IP 档案表单（用户指令唯一真源 · 双资产之一）
 *
 * 对标结论：竞品的稳定输出靠"用户填一次档案 + 生成时整块注入"，不是向量检索。
 * 本模块把七栏档案映射到 IP Wiki 核心页型（AOT 定位底盘），复用现有
 * /api/aim/ip-wiki/pages 读写出入口——表单即编辑器：读取现有 active 页回填，
 * 保存时按页归档版本递增，不产生第二套存储。
 */

export type IpProfileFieldKey = "identity" | "goal" | "audience" | "pain" | "offer" | "usp" | "persona"

/** 档案字段写入的页型（四页承载七栏） */
export type IpProfilePageType = Extract<
  IpWikiPageType,
  "positioning" | "audience" | "conversion_path" | "persona"
>

export interface IpProfileFieldSpec {
  key: IpProfileFieldKey
  label: string
  /** 页内小节标题（保存/回填都按它解析） */
  sectionHeader: string
  pageType: IpProfilePageType
  pageTitle: string
  placeholder: string
  /** 补采提示：缺失时建议用户补什么 */
  fillHint: string
}

export const IP_PROFILE_FIELDS: IpProfileFieldSpec[] = [
  {
    key: "identity",
    label: "我是谁",
    sectionHeader: "## 我是谁",
    pageType: "positioning",
    pageTitle: "定位主张",
    placeholder: "行业/身份/门店类型 + 城市/区域。示例：我在重庆江北区做重庆火锅店，老板亲自炒了 30 年底料。",
    fillHint: "写清行业、身份和地域，一句话就够",
  },
  {
    key: "goal",
    label: "内容目标",
    sectionHeader: "## 内容目标",
    pageType: "positioning",
    pageTitle: "定位主张",
    placeholder: "涨粉/咨询/到店/成交/建立信任；可不填，每篇仍可单独指定。示例：到店 + 建立懂行老板的人设。",
    fillHint: "默认想通过内容拿到什么结果",
  },
  {
    key: "audience",
    label: "我服务谁",
    sectionHeader: "## 我服务谁",
    pageType: "audience",
    pageTitle: "目标人群",
    placeholder: "客户是谁、在什么场景找你。示例：20-40 岁情侣聚餐、家庭聚餐、公司团建，想找味道正宗、价格不虚高的火锅店。",
    fillHint: "目标客户的画像和选择场景",
  },
  {
    key: "pain",
    label: "客户最痛的问题",
    sectionHeader: "## 客户最痛的问题",
    pageType: "audience",
    pageTitle: "目标人群",
    placeholder: "他们最焦虑/最怕踩的坑。示例：怕锅底是料包兑的、怕毛肚不新鲜、怕被宰客。",
    fillHint: "客户下单前最大的顾虑",
  },
  {
    key: "offer",
    label: "我卖什么",
    sectionHeader: "## 我卖什么",
    pageType: "conversion_path",
    pageTitle: "成交路径",
    placeholder: "具体产品/服务/套餐。示例：重庆老火锅、现炒牛油锅底、鲜切牛肉、毛肚鸭肠、4 人聚餐套餐。",
    fillHint: "能拿出去卖的东西清单",
  },
  {
    key: "usp",
    label: "核心卖点",
    sectionHeader: "## 核心卖点",
    pageType: "conversion_path",
    pageTitle: "成交路径",
    placeholder: "最多 3 个真实优势，写具体事实。示例：底料每天现炒；毛肚屠宰场直达不超 8 小时；老板 30 年炒料手艺。",
    fillHint: "最多 3 个，必须是真实可讲的事实",
  },
  {
    key: "persona",
    label: "独特人设",
    sectionHeader: "",
    pageType: "persona",
    pageTitle: "人设",
    placeholder: "经历、身份反差、口头禅、表达特点；没有就不装。示例：说话直、爱怼供应商；当年打工存钱开店的故事；口癖「不新鲜我倒掉」。",
    fillHint: "经历/反差/口头禅/表达特点，让内容像你本人",
  },
]

export const IP_PROFILE_PAGE_ORDER: IpProfilePageType[] = [
  "positioning",
  "audience",
  "conversion_path",
  "persona",
]

export const IP_PROFILE_PAGE_LABELS: Record<IpProfilePageType, string> = {
  positioning: "定位主张",
  audience: "目标人群",
  conversion_path: "成交路径",
  persona: "人设",
}

export type IpProfileForm = Partial<Record<IpProfileFieldKey, string>>

function extractSection(content: string, sectionHeader: string): string | null {
  if (!sectionHeader) return null
  const pattern = new RegExp(`${sectionHeader.replace(/^#+\s*/, "## ")}\\s*\\n([\\s\\S]*?)(?=\\n## |$)`)
  const match = content.match(pattern)
  return match?.[1]?.trim() ?? null
}

/**
 * 从 active 维基页回填表单：按页内小节标题解析；
 * 页存在但没有我们的小节标题（如编译生成）时，整页内容回填到该页第一栏，便于用户在原稿上改。
 */
export function parseProfileFromPages(
  pages: Array<{ pageType: IpWikiPageType; content: string }>,
): IpProfileForm {
  const byType = new Map(pages.map((page) => [page.pageType, page.content ?? ""]))
  const form: IpProfileForm = {}
  for (const pageType of IP_PROFILE_PAGE_ORDER) {
    const content = (byType.get(pageType) ?? "").trim()
    if (!content) continue
    const fields = IP_PROFILE_FIELDS.filter((field) => field.pageType === pageType)
    let matchedAnySection = false
    for (const field of fields) {
      if (!field.sectionHeader) continue
      const section = extractSection(content, field.sectionHeader)
      if (section) {
        form[field.key] = section
        matchedAnySection = true
      }
    }
    if (!matchedAnySection) {
      const first = fields[0]
      if (first) form[first.key] = content
    }
  }
  return form
}

export interface SaveProfilePageInput {
  pageType: IpProfilePageType
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: Array<Record<string, unknown>>
  links: string[]
}

/** 只保存用户填了内容的页；frontmatter 标记来源为档案表单，便于溯源 */
export function buildProfilePages(form: IpProfileForm): SaveProfilePageInput[] {
  const pages: SaveProfilePageInput[] = []
  for (const pageType of IP_PROFILE_PAGE_ORDER) {
    const fields = IP_PROFILE_FIELDS.filter((field) => field.pageType === pageType)
    const parts: string[] = []
    for (const field of fields) {
      const value = (form[field.key] ?? "").trim()
      if (!value) continue
      parts.push(field.sectionHeader ? `${field.sectionHeader}\n${value}` : value)
    }
    if (parts.length === 0) continue
    pages.push({
      pageType,
      title: IP_PROFILE_PAGE_LABELS[pageType],
      content: parts.join("\n\n").slice(0, 8000),
      frontmatter: { origin: "ip_profile_form" },
      sources: [],
      links: [],
    })
  }
  return pages
}

export interface IpProfileCompleteness {
  /** 已就绪的档案页（0-4） */
  presentPages: IpProfilePageType[]
  missingPages: Array<{ pageType: IpProfilePageType; label: string; hint: string }>
  /** 空栏位的补采建议（按表单回填后的实际内容判断） */
  missingFieldHints: string[]
}

/** 完整度 = 页级（哪些档案页缺失）+ 栏级（哪些栏空着，给补采提示） */
export function computeProfileCompleteness(input: {
  pages: Array<{ pageType: IpWikiPageType; content: string }>
}): IpProfileCompleteness {
  const present = new Set(input.pages.filter((page) => (page.content ?? "").trim()).map((page) => page.pageType))
  const presentPages = IP_PROFILE_PAGE_ORDER.filter((pageType) => present.has(pageType))
  const missingPages = IP_PROFILE_PAGE_ORDER
    .filter((pageType) => !present.has(pageType))
    .map((pageType) => {
      const firstField = IP_PROFILE_FIELDS.find((field) => field.pageType === pageType)
      return {
        pageType,
        label: IP_PROFILE_PAGE_LABELS[pageType],
        hint: firstField?.fillHint ?? "",
      }
    })
  const form = parseProfileFromPages(input.pages)
  const missingFieldHints = IP_PROFILE_FIELDS
    .filter((field) => !(form[field.key] ?? "").trim())
    .map((field) => `${field.label}：${field.fillHint}`)
  return { presentPages, missingPages, missingFieldHints }
}
