import { fetchAiHotSelectedItems } from "@/lib/aihot-client"
import { fetchAndStore, getLatestHotList } from "@/lib/douyin-hot"
import { getLatestMarketHotSnapshot, refreshMarketHotSnapshot } from "@/lib/market-insights/market-hotlist"
import type { AiHotItem } from "@/lib/aihot-client"
import type { Last30DaysItem } from "@/lib/market-insights/last30days"
import type { HotTopic } from "@/types/content-template"

export type HotDecisionSource = "market" | "aihot"
type RawHotDecisionSource = "last30days" | "douyin"
export type HotSourceTier = "selected" | "strong" | "medium" | "weak"
export type HotDecisionVerdict = "worth" | "watch" | "caution" | "avoid"

export interface HotDecisionItem {
  id: string
  source: HotDecisionSource | RawHotDecisionSource
  title: string
  summary: string
  url: string
  platform: string
  sourceName: string
  publishedAt: string | null
  score: number
  verdict: HotDecisionVerdict
  verdictLabel: string
  sourceTier: HotSourceTier
  sourceTierLabel: string
  sourceConfidence: string
  reason: string
  recommendedAction: string
  isPreselected: boolean
  clusterSize: number
  relatedTitles: string[]
}

export interface HotDecisionResponse {
  source: HotDecisionSource
  updatedAt: string | null
  items: HotDecisionItem[]
  warnings: string[]
  summary: string
}

/**
 * @description 获取hotdecisions
 * @param source - 来源
 * @returns Promise<HotDecisionResponse>
 */
export async function getHotDecisions(source: HotDecisionSource): Promise<HotDecisionResponse> {
  if (source === "aihot") return buildAiHotDecisions()
  return buildMarketDecisions()
}

/**
 * @description 刷新hotdecisions
 * @param source - 来源
 * @returns Promise<HotDecisionResponse>
 */
export async function refreshHotDecisions(source: HotDecisionSource): Promise<HotDecisionResponse> {
  if (source === "market") {
    await refreshMarketHotSnapshot()
    await fetchAndStore()
    return buildMarketDecisions()
  }
  return buildAiHotDecisions()
}

/**
 * @description decidelast30daysitems
 * @param items - 条目列表
 * @returns HotDecisionItem[]
 */
export function decideLast30DaysItems(items: Last30DaysItem[]): HotDecisionItem[] {
  return clusterAndSelect(items.map(fromLast30Days))
    .filter((item) => item.score >= 40 && item.verdict !== "avoid")
    .slice(0, 60)
}

/**
 * @description decidedouyinitems
 * @param items - 条目列表
 * @returns HotDecisionItem[]
 */
export function decideDouyinItems(items: HotTopic[]): HotDecisionItem[] {
  return clusterAndSelect(items.map(fromDouyin))
    .filter((item) => item.score >= 40 && item.verdict !== "avoid")
    .slice(0, 60)
}

/**
 * @description decideaihotitems
 * @param items - 条目列表
 * @returns HotDecisionItem[]
 */
export function decideAiHotItems(items: AiHotItem[]): HotDecisionItem[] {
  return items.slice(0, 50).map((item, index) => ({
    id: item.id || `aihot-${index}`,
    source: "aihot",
    title: item.title,
    summary: item.summary || "AI HOT 已筛选条目，适合作为 AI 内容选题参考。",
    url: item.url,
    platform: "aihot",
    sourceName: item.source || "AI HOT",
    publishedAt: item.publishedAt || null,
    score: 90,
    verdict: "worth",
    verdictLabel: "值得看",
    sourceTier: "selected",
    sourceTierLabel: "AI HOT 已精选",
    sourceConfidence: "已精选",
    reason: "这条来自 AI HOT 精选池，已完成基础信源过滤，适合直接判断内容角度。",
    recommendedAction: "适合交给深度文案官，提炼成观点型内容。",
    isPreselected: true,
    clusterSize: 1,
    relatedTitles: [],
  }))
}

async function buildAiHotDecisions(): Promise<HotDecisionResponse> {
  try {
    const data = await fetchAiHotSelectedItems()
    return {
      source: "aihot",
      updatedAt: new Date().toISOString(),
      items: decideAiHotItems(data.items),
      warnings: [],
      summary: "AI HOT 已经是精选数据，本页只做解释和创作入口。",
    }
  } catch {
    return emptyResponse("aihot", "AI HOT 精选暂时不可用")
  }
}

async function buildMarketDecisions(): Promise<HotDecisionResponse> {
  const [snapshot, topics] = await Promise.all([getLatestMarketHotSnapshot(), getLatestHotList()])
  const items = clusterAndSelect([
    ...decideLast30DaysItems(snapshot.items),
    ...decideDouyinItems(topics),
  ]).slice(0, 80)

  return {
    source: "market",
    updatedAt: snapshot.generatedAt || topics[0]?.fetchedAt || null,
    items,
    warnings: [...snapshot.warnings, ...(topics.length ? [] : ["抖音热榜缓存暂无数据"])],
    summary: "近 30 天热榜和抖音热榜已合并筛选，优先保留商业创业、消费趋势、企业经营和内容增长相关热点。",
  }
}

function fromLast30Days(item: Last30DaysItem): HotDecisionItem {
  const sourceTier = getPlatformTier(item.platform)
  const titleScore = scoreTitle(item.title)
  const businessScore = scoreBusinessRelevance(`${item.title} ${item.excerpt}`)
  const risk = riskScore(item.title)
  // 放宽开口：无业务相关性不再直接判 avoid，改为降分 + caution，让边缘热点也能进列表供人工判断
  const relevancePenalty = businessScore === 0 ? 16 : 0
  const score = clamp(Math.round(item.score * 0.45 + titleScore + businessScore + tierBonus(sourceTier) + recencyBonus(item.date) - relevancePenalty))
  const verdict = risk >= 30 ? "avoid" : businessScore === 0 ? "caution" : getVerdict(score, risk)

  return {
    id: item.id,
    source: "last30days",
    title: item.title,
    summary: item.excerpt || "来自近 30 天多平台讨论热榜。",
    url: item.url,
    platform: item.platform,
    sourceName: item.author || platformName(item.platform),
    publishedAt: item.date || null,
    score,
    verdict,
    verdictLabel: verdictLabel(verdict),
    sourceTier,
    sourceTierLabel: sourceTierLabel(sourceTier),
    sourceConfidence: sourceTierLabel(sourceTier),
    reason: buildReason(verdict, businessScore, titleScore, false),
    recommendedAction: actionFor(verdict),
    isPreselected: false,
    clusterSize: 1,
    relatedTitles: [],
  }
}

function fromDouyin(topic: HotTopic): HotDecisionItem {
  const titleScore = scoreTitle(topic.title)
  const businessScore = scoreBusinessRelevance(topic.title)
  const heatScore = Math.min(28, Math.log10(Math.max(topic.hotValue, 1)) * 7)
  const videoScore = Math.min(12, Math.log10(Math.max(topic.videoCount, 1)) * 3)
  const risk = riskScore(topic.title)
  const labelBonus = topic.label === "hot" ? 8 : topic.label === "new" ? 4 : topic.label === "recommended" ? 6 : 0
  // ponytail: 抖音热榜噪音更高，无业务相关性的题直接重罚，留出人工判断空间但默认不过线
  const relevancePenalty = businessScore === 0 ? 45 : 0
  const score = clamp(Math.round(titleScore + businessScore + heatScore + videoScore + labelBonus - risk - relevancePenalty))
  const verdict = risk >= 30 ? "avoid" : businessScore === 0 ? "caution" : getVerdict(score, risk)

  return {
    id: topic.id,
    source: "douyin",
    title: topic.title,
    summary: "来自抖音实时热榜，已按内容创作价值做过滤。",
    url: topic.douyinSearchUrl,
    platform: "douyin",
    sourceName: "抖音热榜",
    publishedAt: topic.fetchedAt,
    score,
    verdict,
    verdictLabel: verdictLabel(verdict),
    sourceTier: "medium",
    sourceTierLabel: "平台热榜",
    sourceConfidence: "平台热榜",
    reason: buildReason(verdict, businessScore, titleScore, risk > 0),
    recommendedAction: actionFor(verdict),
    isPreselected: false,
    clusterSize: 1,
    relatedTitles: [],
  }
}

function clusterAndSelect(items: HotDecisionItem[]): HotDecisionItem[] {
  const clusters: HotDecisionItem[][] = []
  for (const item of items) {
    const key = normalizeTitle(item.title)
    const cluster = clusters.find((group) => group.some((entry) => isSimilar(key, normalizeTitle(entry.title))))
    if (cluster) cluster.push(item)
    else clusters.push([item])
  }

  return clusters
    .map((group) => {
      const sorted = [...group].sort((a, b) => b.score - a.score || tierRank(b.sourceTier) - tierRank(a.sourceTier))
      const lead = sorted[0]
      return {
        ...lead,
        clusterSize: group.length,
        relatedTitles: sorted.slice(1, 4).map((item) => item.title),
      }
    })
    .sort((a, b) => b.score - a.score)
}

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/#[^\s#]+/g, "").replace(/[^\p{L}\p{N}]+/gu, "")
}

function isSimilar(a: string, b: string) {
  if (!a || !b) return false
  if (a === b) return true
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  return shorter.length >= 8 && longer.includes(shorter)
}

function getPlatformTier(platform: string): HotSourceTier {
  if (platform === "wechat" || platform === "zhihu") return "strong"
  if (platform === "xiaohongshu" || platform === "bilibili" || platform === "douyin") return "medium"
  return "weak"
}

function scoreTitle(title: string) {
  let score = 18
  if (title.length >= 8 && title.length <= 36) score += 10
  if (/[？?]/.test(title)) score += 4
  if (/[0-9一二三四五六七八九十]/.test(title)) score += 4
  if (/官宣|发布|上线|更新|爆火|趋势|争议|首次|增长|降本|获客|成交/.test(title)) score += 8
  if (title.length < 5) score -= 10
  return score
}

function scoreBusinessRelevance(text: string) {
  const keywords = [
    "AI", "IP", "人工智能",
    "商业", "创业", "生意", "老板", "公司", "企业", "品牌", "门店", "行业",
    "投资", "金融", "房产", "楼市", "地产", "资产", "基金", "股票", "融资",
    "消费", "价格", "产品", "服务", "用户", "客户", "流量", "营销", "获客",
    "成交", "增长", "直播", "电商", "短视频", "内容", "私域", "招商",
    "加盟", "供应链", "降本", "效率", "管理", "赚钱", "营收",
  ]
  return keywords.reduce((score, word) => {
    if (word === "AI") return score + (/(^|[^a-z])ai([^a-z]|$)/i.test(text) ? 4 : 0)
    if (word === "IP") return score + (/(^|[^a-z])ip([^a-z]|$)/i.test(text) ? 4 : 0)
    return score + (text.includes(word) ? 4 : 0)
  }, 0)
}

function riskScore(title: string) {
  if (/明星|恋情|离婚|出轨|博彩|血腥|色情|暴力|事故|灾难|死亡|死了|犯罪|比分|夺冠|世界杯|联赛|足球|篮球|梅西|C罗/.test(title)) return 35
  if (/八卦|绯闻|塌房|吃瓜/.test(title)) return 22
  return 0
}

function recencyBonus(date: string) {
  const time = new Date(date || 0).getTime()
  if (!time) return 0
  const days = (Date.now() - time) / 86400000
  if (days <= 3) return 8
  if (days <= 14) return 4
  return 0
}

function tierBonus(tier: HotSourceTier) {
  return tier === "strong" ? 12 : tier === "medium" ? 7 : tier === "selected" ? 15 : 2
}

function tierRank(tier: HotSourceTier) {
  return tier === "selected" ? 4 : tier === "strong" ? 3 : tier === "medium" ? 2 : 1
}

function getVerdict(score: number, risk: number): HotDecisionVerdict {
  if (risk >= 30) return "avoid"
  if (score >= 78) return "worth"
  if (score >= 62) return "watch"
  if (score >= 50) return "caution"
  return "avoid"
}

function verdictLabel(verdict: HotDecisionVerdict) {
  return verdict === "worth" ? "值得看" : verdict === "watch" ? "可观察" : verdict === "caution" ? "谨慎追" : "不建议追"
}

function sourceTierLabel(tier: HotSourceTier) {
  return tier === "selected" ? "已精选" : tier === "strong" ? "较高可信" : tier === "medium" ? "平台信号" : "弱信号"
}

function buildReason(verdict: HotDecisionVerdict, businessScore: number, titleScore: number, hasRisk: boolean) {
  if (verdict === "avoid") return hasRisk ? "话题风险偏高，不适合直接借势。" : "业务相关性和内容可创作性都偏弱。"
  if (businessScore >= 16) return "和 AI、增长、内容或成交场景有关，适合转成老板视角观点。"
  if (titleScore >= 36) return "标题具备冲突、趋势或问题感，可以作为内容切口。"
  return "有一定讨论度，但需要结合自身业务后再追。"
}

function actionFor(verdict: HotDecisionVerdict) {
  if (verdict === "worth") return "适合马上进入 AIM 创作。"
  if (verdict === "watch") return "适合交给深度文案官打磨观点。"
  if (verdict === "caution") return "先加入选题库观察，不建议直接发布。"
  return "不建议追。"
}

function platformName(platform: string) {
  const names: Record<string, string> = {
    weibo: "微博",
    xiaohongshu: "小红书",
    bilibili: "B站",
    zhihu: "知乎",
    douyin: "抖音",
    wechat: "微信",
    baidu: "百度",
    toutiao: "今日头条",
  }
  return names[platform] || platform
}

function clamp(score: number) {
  return Math.max(0, Math.min(100, score))
}

function emptyResponse(source: HotDecisionSource, warning: string): HotDecisionResponse {
  return { source, updatedAt: null, items: [], warnings: [warning], summary: "" }
}
