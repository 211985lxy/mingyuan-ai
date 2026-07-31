/**
 * IP 操盘案（IP Wiki）合规校验器
 *
 * 在有了 IP 定位维基（六页核心）之后，任何文案生成 / 选题产出都要先判定
 * 是否符合 IP 操盘案。此模块执行六维度确定性校验（对齐 goal-verifier 结构），
 * 不依赖 LLM，输出可直接用于生成链路自动重试与质检报告。
 *
 * 校验规则来源：操盘案数据库行 IpWikiPageRow.frontmatter + 原文内容词扫。
 * 当操盘案缺页/字段缺时，对应维度判定 SKIP（不记问题，在 summary 里标注"资料不足"）。
 */

import type { IpWikiPageType } from "@/lib/ip-wiki/types"
import { IP_WIKI_CORE_PAGE_TYPES, IP_WIKI_PAGE_TYPE_LABELS } from "@/lib/ip-wiki/types"
import type { IpWikiPageRow } from "@/lib/ip-wiki/repo"

export type IpWikiComplianceDimension =
  | "positioning"
  | "persona"
  | "content_strategy"
  | "audience"
  | "conversion_path"
  | "topic_direction"

export interface IpWikiComplianceIssue {
  dimension: IpWikiComplianceDimension
  dimensionLabel: string
  mustFix: boolean
  reason: string
  suggestedFix?: string
}

export interface IpWikiComplianceResult {
  ok: boolean
  summary: string
  issues: IpWikiComplianceIssue[]
}

/** 取指定页的 frontmatter（只读），缺则返回 null。 */
function getPageFrontmatter(
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
  pageType: IpWikiPageType,
): Record<string, unknown> | null {
  const row = pages[pageType]
  if (!row?.frontmatter || typeof row.frontmatter !== "object") return null
  return row.frontmatter as Record<string, unknown>
}

/** 取页面原文（不含 frontmatter 标题）。 */
function getPageText(pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>, pageType: IpWikiPageType): string {
  return pages[pageType]?.content ?? ""
}

/** 合并所有文案内容为小写统一字符串（匹配用）。 */
function concatContents(contents: string[]): string {
  return contents.join("\n").toLowerCase()
}

/** 取 frontmatter 里的字符串数组字段（容错）。 */
function pickStringArr(fm: Record<string, unknown> | null, key: string): string[] {
  if (!fm) return []
  const raw = fm[key]
  if (Array.isArray(raw)) return raw.map((x) => String(x)).filter(Boolean)
  if (typeof raw === "string") return raw.split(/[,，、\n]/).map((x) => x.trim()).filter(Boolean)
  return []
}

function pickString(fm: Record<string, unknown> | null, key: string): string {
  if (!fm) return ""
  const raw = fm[key]
  return typeof raw === "string" ? raw : ""
}

/** 简单关键词命中：把 needle 分词后至少 1 个 token 在 haystack 出现（长度>=2）。 */
function containsAnyKeyword(haystack: string, needles: string[]): boolean {
  if (!haystack) return false
  for (const n of needles) {
    const tokens = n
      .trim()
      .split(/[\s,，、。;:：；()（）\[\]【】<>《》…—/\\\-]/)
      .filter((t) => t.length >= 2)
    for (const tk of tokens) {
      if (haystack.includes(tk.toLowerCase())) return true
    }
  }
  return false
}

// ======================== 六位度校验 ========================

/** 1. 定位主张：文案不能承诺 Slogan / 差异化 / 价值承诺 之外的东西。 */
function checkPositioning(
  contentsCombined: string,
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
): IpWikiComplianceIssue[] {
  const fm = getPageFrontmatter(pages, "positioning")
  const issues: IpWikiComplianceIssue[] = []
  if (!fm) return issues

  const slogans = pickStringArr(fm, "slogan")
  const valuePromises = pickStringArr(fm, "valuePromise")
  const differentiations = pickStringArr(fm, "differentiation")
  const taboos = pickStringArr(fm, "taboos")

  if (taboos.length > 0 && containsAnyKeyword(contentsCombined, taboos)) {
    issues.push({
      dimension: "positioning",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.positioning,
      mustFix: true,
      reason: `文案里出现了定位页明确禁止的承诺词（${taboos.filter((t) => contentsCombined.includes(t.toLowerCase())).slice(0, 3).join("/")}），与 Slogan/差异化/价值承诺不符。`,
      suggestedFix: "删除超纲承诺，把落脚点拉回操盘案里的价值承诺与差异化。",
    })
  }

  const positioningTexts = [...slogans, ...valuePromises, ...differentiations]
  if (positioningTexts.length >= 3 && !containsAnyKeyword(contentsCombined, positioningTexts)) {
    issues.push({
      dimension: "positioning",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.positioning,
      mustFix: false,
      reason: "文案未命中任何 Slogan / 价值承诺 / 差异化关键词，可能没踩准 IP 定位的核心主张。",
      suggestedFix: "在开头或中段推进处，点一句操盘案里的核心价值承诺或差异化关键词。",
    })
  }

  return issues
}

/** 2. 人设：文案不能出现自我介绍堆头衔 / 口头禅错误 / 违背人设标签。 */
function checkPersona(
  contentsCombined: string,
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
): IpWikiComplianceIssue[] {
  const fm = getPageFrontmatter(pages, "persona")
  const issues: IpWikiComplianceIssue[] = []
  if (!fm) return issues

  const taboos = pickStringArr(fm, "taboos")
  const valueAnchors = pickStringArr(fm, "valueAnchors")
  const patterns = pickStringArr(fm, "patterns")
  const role = pickString(fm, "role").toLowerCase()

  // 人设硬规则：禁止堆头衔自我介绍（"大家好我是XX专家/XX创始人/从事XX行业XX年"这种模式化开场）
  const introPattern =
    /(?:大家好|大家好我是|哈喽我是|我是)[^，。,.]{0,30}(?:专家|创始人|合伙人|老师|总监|博士|教授|从事.{1,10}年|从业.{1,10}年)/i
  if (introPattern.test(contentsCombined) && !patterns.includes("允许自我介绍")) {
    issues.push({
      dimension: "persona",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.persona,
      mustFix: true,
      reason: "文案使用了'大家好我是XX专家/从事XX年'式堆头衔开场，违反人设页'少自我介绍、用内容说话'的默认硬规则；若此账号人设确需自我介绍，在人设页 patterns 里显式登记。",
      suggestedFix: "改成具体场景/问题/细节切入开头，把身份藏在专业判断与内容里。",
    })
  }

  if (taboos.length > 0 && containsAnyKeyword(contentsCombined, taboos)) {
    const hits = taboos.filter((t) => contentsCombined.includes(t.toLowerCase())).slice(0, 3)
    if (hits.length > 0) {
      issues.push({
        dimension: "persona",
        dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.persona,
        mustFix: true,
        reason: `文案出现人设页明确禁止的表达：${hits.join("/")}。`,
        suggestedFix: "删除或替换成操盘案里人设 patterns / valueAnchors 的表达风格。",
      })
    }
  }

  if (valueAnchors.length >= 2 && !containsAnyKeyword(contentsCombined, valueAnchors)) {
    issues.push({
      dimension: "persona",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.persona,
      mustFix: false,
      reason: "文案未命中人设页的任何价值锚点关键词，人设气质可能立不起来。",
      suggestedFix: "在关键转折或判断输出句里，用一句人设价值锚点风格的话说出来。",
    })
  }

  if (role && contentsCombined.includes(role) === false && /(我是|我这|像我)/.test(contentsCombined) === true) {
    // 角色词（如"一个做了10年的税务师"）如果在文案里完全没出现但文案在用第一人称，不强制，只 warning
  }

  return issues
}

/** 3. 内容策略底盘：话题方向 / 钩子模式 / 内容格式。 */
function checkContentStrategy(
  contentsCombined: string,
  contents: string[],
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
): IpWikiComplianceIssue[] {
  const fm = getPageFrontmatter(pages, "content_strategy")
  const issues: IpWikiComplianceIssue[] = []
  if (!fm) return issues

  const topicDistribution = pickStringArr(fm, "topicDistribution")
  const hookPatterns = pickStringArr(fm, "hookPatterns")
  const contentFormats = pickStringArr(fm, "contentFormats")
  const taboos = pickStringArr(fm, "taboos")

  if (taboos.length > 0 && containsAnyKeyword(contentsCombined, taboos)) {
    const hits = taboos.filter((t) => contentsCombined.includes(t.toLowerCase())).slice(0, 3)
    issues.push({
      dimension: "content_strategy",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.content_strategy,
      mustFix: true,
      reason: `文案出现内容策略底盘明确禁止的表达 / 话题：${hits.join("/")}。`,
      suggestedFix: "删除超纲话题，话题方向拉回 topicDistribution 列的范围。",
    })
  }

  if (hookPatterns.length >= 2) {
    // 看开头前 100 字是否命中至少一个钩子模式（关键词）
    const head = contents.map((c) => c.slice(0, 120)).join("").toLowerCase()
    if (!containsAnyKeyword(head, hookPatterns)) {
      issues.push({
        dimension: "content_strategy",
        dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.content_strategy,
        mustFix: false,
        reason: "开头未命中内容策略底盘登记的任何钩子模式（hookPatterns），可能不在操盘案的爆款公式路径里。",
        suggestedFix: `从以下钩子模式中选一种写开头：${hookPatterns.slice(0, 4).join("/")}。`,
      })
    }
  }

  if (contentFormats.length >= 2 && !containsAnyKeyword(contentsCombined, contentFormats)) {
    // 格式关键词（步骤/清单/对照/案例/对比/故事...）如一个都没出现，提示
    issues.push({
      dimension: "content_strategy",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.content_strategy,
      mustFix: false,
      reason: "文案未显式使用内容策略底盘登记的任何内容格式关键词（步骤/清单/案例/故事等）。",
      suggestedFix: `在正文中加一个内容格式抓手，例如：${contentFormats.slice(0, 3).join("/")}，让用户感知结构。`,
    })
  }

  // topicDistribution 命中检测
  if (topicDistribution.length >= 2 && !containsAnyKeyword(contentsCombined, topicDistribution)) {
    issues.push({
      dimension: "content_strategy",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.content_strategy,
      mustFix: false,
      reason: "文案未命中内容策略底盘 topicDistribution 的任何话题方向。",
      suggestedFix: `把话题切回操盘案里的专栏方向，例如：${topicDistribution.slice(0, 3).join("/")}。`,
    })
  }

  return issues
}

/** 4. 目标人群：核心人群 / 痛点 / 决策场景 / 变现方式。 */
function checkAudience(
  contentsCombined: string,
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
): IpWikiComplianceIssue[] {
  const fm = getPageFrontmatter(pages, "audience")
  const issues: IpWikiComplianceIssue[] = []
  if (!fm) return issues

  const coreAudience = pickStringArr(fm, "coreAudience")
  const painPoints = pickStringArr(fm, "painPoints")
  const decisionScenarios = pickStringArr(fm, "decisionScenarios")
  const monetizationStyles = pickStringArr(fm, "monetizationStyles")
  const excludedAudiences = pickStringArr(fm, "excludedAudiences")

  if (excludedAudiences.length > 0 && containsAnyKeyword(contentsCombined, excludedAudiences)) {
    const hits = excludedAudiences.filter((t) => contentsCombined.includes(t.toLowerCase())).slice(0, 3)
    issues.push({
      dimension: "audience",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.audience,
      mustFix: true,
      reason: `文案在跟人群画像里"明确排除"的受众说话：${hits.join("/")}；这会引错流量。`,
      suggestedFix: "在开头或适合谁/不适合谁段里显式划清，把受众拉回 coreAudience。",
    })
  }

  const audienceHits = [...coreAudience, ...painPoints, ...decisionScenarios, ...monetizationStyles]
  if (audienceHits.length >= 3 && !containsAnyKeyword(contentsCombined, audienceHits)) {
    issues.push({
      dimension: "audience",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.audience,
      mustFix: false,
      reason: "文案未命中核心人群 / 痛点 / 决策场景 / 变现方式四类关键词，可能踩偏了目标人群画像。",
      suggestedFix: "把文案切入到操盘案登记的一个具体痛点或决策场景。",
    })
  }

  return issues
}

/** 5. 成交路径：CTA 类型 / 产品阶梯 / 私域承接词。 */
function checkConversionPath(
  contentsCombined: string,
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
): IpWikiComplianceIssue[] {
  const fm = getPageFrontmatter(pages, "conversion_path")
  const issues: IpWikiComplianceIssue[] = []
  if (!fm) return issues

  const allowedCtas = pickStringArr(fm, "allowedCtas")
  const productStairway = pickStringArr(fm, "productStairway")
  const privateChannelKeywords = pickStringArr(fm, "privateChannelKeywords")
  const forbiddenCtas = pickStringArr(fm, "forbiddenCtas")
  const pricingAnchors = pickStringArr(fm, "pricingAnchors")

  if (forbiddenCtas.length > 0 && containsAnyKeyword(contentsCombined, forbiddenCtas)) {
    const hits = forbiddenCtas.filter((t) => contentsCombined.includes(t.toLowerCase())).slice(0, 3)
    issues.push({
      dimension: "conversion_path",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.conversion_path,
      mustFix: true,
      reason: `文案用了成交路径明确禁止的 CTA：${hits.join("/")}；会破坏产品阶梯承接节奏。`,
      suggestedFix: allowedCtas.length > 0
        ? `从 allowedCtas 里选一种轻行动承接，例如：${allowedCtas.slice(0, 3).join("/")}。`
        : "改成与操盘案产品阶梯匹配的一种轻行动承接（不要直接喊买/喊私信）。",
    })
  }

  const ctaPattern = /(评论|私信|预约|点击|关注|加我|微信|扫码|下单|购买|领|清单|资料|报告|咨询|报名)/i
  const hasAnyCta = ctaPattern.test(contentsCombined)
  if (hasAnyCta && allowedCtas.length >= 1 && !containsAnyKeyword(contentsCombined, allowedCtas)) {
    issues.push({
      dimension: "conversion_path",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.conversion_path,
      mustFix: true,
      reason: `文案有 CTA 但不在成交路径 allowedCtas 列表里（${allowedCtas.join("/")}），成交链路会错位。`,
      suggestedFix: `把结尾 CTA 改成 allowedCtas 里的一种，并说清"行动后能得到什么"。`,
    })
  }

  // 产品阶梯：如果文案提到产品/服务名（粗扫），但没命中产品阶梯里的任一个词，提示
  const productStyleWords = /(产品|服务|方案|课程|咨询|陪跑|社群|训练营|会员)/i
  if (productStyleWords.test(contentsCombined) && productStairway.length > 0 &&
      !containsAnyKeyword(contentsCombined, productStairway) &&
      !containsAnyKeyword(contentsCombined, pricingAnchors)) {
    issues.push({
      dimension: "conversion_path",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.conversion_path,
      mustFix: false,
      reason: "文案提到了产品/服务但未命中产品阶梯里的具体 SKU / 定价锚点；如果要带转化，名字必须跟操盘案一致。",
      suggestedFix: `用产品阶梯里的具体名字，例如：${productStairway.slice(0, 3).join("/")}。`,
    })
  }

  // 私域承接词粗扫：如果文案里出现私域词，必须是登记过的
  if (privateChannelKeywords.length > 0) {
    const roughPrivateChannel = /(加微信|加个微信|私信我微信|vx|V信|添加客服|企微|企业微信|进群|扫码进|私域)/i
    if (roughPrivateChannel.test(contentsCombined) && !containsAnyKeyword(contentsCombined, privateChannelKeywords)) {
      issues.push({
        dimension: "conversion_path",
        dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.conversion_path,
        mustFix: true,
        reason: "文案引导私域，但用的承接词不在成交路径登记的 privateChannelKeywords 里，会让承接页/运营链路错位。",
        suggestedFix: `私域引导只能用登记的承接词：${privateChannelKeywords.join("/")}。`,
      })
    }
  }

  return issues
}

/** 6. 选题方向：必须属于 topic_direction 列出的 3-5 个核心专栏方向之一。 */
function checkTopicDirection(
  contentsCombined: string,
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
): IpWikiComplianceIssue[] {
  const fm = getPageFrontmatter(pages, "topic_direction")
  const issues: IpWikiComplianceIssue[] = []
  if (!fm) return issues

  const coreColumns = pickStringArr(fm, "coreColumns")
  const pillarTopics = pickStringArr(fm, "pillarTopics")
  const taboos = pickStringArr(fm, "taboos")
  const audienceTargets = pickStringArr(fm, "audienceTargets")

  if (taboos.length > 0 && containsAnyKeyword(contentsCombined, taboos)) {
    const hits = taboos.filter((t) => contentsCombined.includes(t.toLowerCase())).slice(0, 3)
    issues.push({
      dimension: "topic_direction",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.topic_direction,
      mustFix: true,
      reason: `文案命中了选题方向页明确禁止的话题：${hits.join("/")}。`,
      suggestedFix: "删除违规话题，选题回到 coreColumns / pillarTopics。",
    })
  }

  const directionHits = [...coreColumns, ...pillarTopics, ...audienceTargets]
  if (directionHits.length >= 3 && !containsAnyKeyword(contentsCombined, directionHits)) {
    issues.push({
      dimension: "topic_direction",
      dimensionLabel: IP_WIKI_PAGE_TYPE_LABELS.topic_direction,
      mustFix: false,
      reason: "文案未命中选题方向页的任何核心专栏 / 支柱话题 / 目标人群专栏词；如果不换题，这条会偏离 IP 选题底盘。",
      suggestedFix: `选题锚定以下其中一个核心专栏方向：${coreColumns.slice(0, 5).join("/")}。`,
    })
  }

  return issues
}

// ======================== 公共入口 ========================

/**
 * 六维度合规校验主入口。
 *
 * - contents：待校验的完整口播正文数组（多条会合并校验）
 * - pages：IP Wiki 六页核心数据（按 pageType 索引；缺页不会报错，只影响 summary 的"资料不足"标注）
 */
export async function verifyIpWikiCompliance(
  contents: string[],
  pages: Partial<Record<IpWikiPageType, IpWikiPageRow>>,
): Promise<IpWikiComplianceResult> {
  const combined = concatContents(contents)
  const issues: IpWikiComplianceIssue[] = [
    ...checkPositioning(combined, pages),
    ...checkPersona(combined, pages),
    ...checkContentStrategy(combined, contents, pages),
    ...checkAudience(combined, pages),
    ...checkConversionPath(combined, pages),
    ...checkTopicDirection(combined, pages),
  ]

  // 统计缺页（SKIP 标注用）
  const presentCoreCount = IP_WIKI_CORE_PAGE_TYPES.filter((t) => pages[t]).length
  const missingCore = IP_WIKI_CORE_PAGE_TYPES.filter((t) => !pages[t])
  const ok = issues.every((i) => !i.mustFix)

  const dimensionLine = (() => {
    const byDimension = new Map<string, { must: number; warn: number }>()
    for (const i of issues) {
      const cur = byDimension.get(i.dimension) ?? { must: 0, warn: 0 }
      if (i.mustFix) cur.must += 1; else cur.warn += 1
      byDimension.set(i.dimension, cur)
    }
    if (byDimension.size === 0) return "六维度均未发现问题"
    const parts = Array.from(byDimension.entries()).map(([dim, c]) => {
      const label = (IP_WIKI_PAGE_TYPE_LABELS as Record<string, string>)[dim] ?? dim
      const msgs = []
      if (c.must > 0) msgs.push(`${label}必改×${c.must}`)
      if (c.warn > 0) msgs.push(`${label}提醒×${c.warn}`)
      return msgs.join("+")
    }).filter(Boolean)
    return parts.join("；")
  })()

  const dataQualityLine =
    presentCoreCount < IP_WIKI_CORE_PAGE_TYPES.length
      ? `（资料不足：IP 操盘案核心 ${IP_WIKI_CORE_PAGE_TYPES.length} 页仅 ${presentCoreCount} 页齐备；缺：${missingCore
          .map((t) => IP_WIKI_PAGE_TYPE_LABELS[t])
          .join("、")}；缺页对应维度不做判定）`
      : ""

  const summary =
    `IP 操盘案合规判定：${ok ? "通过" : "未通过（存在必改问题）"}。${dimensionLine}。${dataQualityLine}`.trim()

  return { ok, issues, summary }
}

/**
 * 把合规 issues 拼到重写 prompt 附录。
 * 对齐 goal-verifier 的 buildGoalRewritePromptAppendix：
 *  - 无必改问题时返回空串（不触发强制重写）
 *  - 有必改问题时用结构化格式告诉 LLM 必须改哪几条、为什么、建议怎么改
 */
export function buildIpWikiComplianceRewritePrompt(result: IpWikiComplianceResult): string {
  const mustFix = result.issues.filter((i) => i.mustFix)
  if (mustFix.length === 0) return ""

  const lines = [
    "【IP 操盘案合规校验未通过，必须逐条修正后再出稿】：",
    ...mustFix.map((i, idx) => {
      const base = `  问题 ${idx + 1}（${i.dimensionLabel}）：${i.reason}`
      return i.suggestedFix ? `${base}；建议：${i.suggestedFix}` : base
    }),
    "重写原则：① 只改不合规的地方，不要打乱原文结构和句子推进节奏；② 修正后必须回到 IP 操盘案的定位/人设/选题/CTA 登记范围内；③ 仍输出可直接拍摄的完整口播正文，不要输出分析、理由或修订记录。",
  ]
  return lines.join("\n")
}

/** 把 issues 格式化为行内摘要（给 review 报告 / 前端展示用）。 */
export function formatIpWikiComplianceIssues(result: IpWikiComplianceResult): string {
  if (result.issues.length === 0) return "无问题"
  return result.issues
    .map((i, idx) => `${idx + 1}. [${i.dimensionLabel}]${i.mustFix ? "【必改】" : "【提醒】"} ${i.reason}`)
    .join("\n")
}
