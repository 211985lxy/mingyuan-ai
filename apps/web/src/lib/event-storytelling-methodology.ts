import { getMethodologyBlock } from "@/lib/agent-methodology-store"

/**
 * 事件内容化方法论（视频日记 / 项目现场 / 事件复盘叙事专用）。
 *
 * 与 IP 操盘方法论、商业诊断方法论同构：DB 优先 + 文件兜底 + 编辑即时生效
 * （实际加载逻辑收敛到 agent-methodology-store）。
 * 与前两者不同——本方法论是「按需注入」，仅当创作内容属于"现场/事件复盘类"
 * 时才加载，避免给普通口播/转化内容增加噪声。触发判断见 shouldUseEventStorytelling。
 */
/**
 * @description 构建eventstorytellingmethodologyblock
 * @returns Promise<string>
 */
export async function buildEventStorytellingMethodologyBlock(): Promise<string> {
  return getMethodologyBlock("event_storytelling")
}

/**
 * 判断本次创作是否属于"现场/事件复盘类"内容，决定是否注入事件内容化方法论。
 *
 * 触发条件（命中任一即视为该类）：
 * 1. topicType 为"人设型"且输入含现场/事件关键词（人设型天然承载 vlog/现场）；
 * 2. 原始输入明显是"现场记录/事件描述"（含出差、项目现场、今天去、客户现场等词）；
 * 3. 内容场景显式为现场/日记类（预留，当前 ContentScenario 无此值则不触发）。
 */
const EVENT_KEYWORDS = [
  // 现场记录类
  "现场", "出差", "去了", "今天去", "昨天去", "客户现场", "项目现场", "工地",
  "门店", "工厂", "仓库", "实地", "跑客户", "拜访",
  // 事件复盘类
  "复盘", "发生了", "遇到了一个问题", "这次", "上次我们", "那天",
  // vlog / 日记类
  "vlog", "日记", "记录", "随手拍", "日常",
]

/**
 * @description 判断是否应该useeventstorytelling
 * @param input - 输入数据
 * @returns boolean
 */
export function shouldUseEventStorytelling(input: {
  rawInput?: string
  topicTitle?: string
  topicType?: string
  topicRationale?: string
}): boolean {
  const haystack = [
    input.rawInput ?? "",
    input.topicTitle ?? "",
    input.topicRationale ?? "",
  ]
    .join(" ")
    .toLowerCase()

  // 关键词命中（不区分大小写，兼顾 vlog 这类）
  if (EVENT_KEYWORDS.some((kw) => haystack.includes(kw.toLowerCase()))) {
    return true
  }

  return false
}
