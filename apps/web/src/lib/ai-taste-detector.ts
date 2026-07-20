/**
 * AI 味检测器 — 93 个禁词黑名单 + 句式评分
 *
 * 检测文案中的 AI 写作特征，输出 1-10 分（越低越人类化）。
 * PRD 模块 4.1 四维质量门控之一。
 */

// ─── 93 个 AI 高频禁词 ─────────────────────────────────────
export const AI_FORBIDDEN_WORDS: string[] = [
  // ── 空洞修饰类 ──
  "令人印象深刻", "值得注意", "不可忽视", "至关重要", "毋庸置疑",
  "不言而喻", "显而易见", "众所周知", "毋庸置疑地", "毫无疑问",
  "深入浅出", "娓娓道来", "引人深思", "发人深省", "耐人寻味",

  // ── AI 书面表达类 ──
  "总而言之", "综上所述", "由此可见", "整体而言", "从某种意义上说",
  "与此同时", "在这个过程中", "一方面...另一方面", "不仅...而且",
  "旨在", "致力于", "赋能", "助力", "携手",
  "一站式", "全方位", "多维度", "新常态", "闭环",

  // ── 排比套路类 ──
  "首先...其次...最后", "第一...第二...第三",
  "让我们一起", "是时候", "别犹豫了",
  "赶快行动", "立即体验", "不容错过",

  // ── 营销套话类 ──
  "开创了新纪元", "引领行业", "颠覆认知", "重新定义",
  "打造极致体验", "突破边界", "想象一下", "改变游戏规则",
  "前所未有的", "史无前例的", "划时代的",

  // ── 结论套路类 ──
  "在这个充满挑战和机遇的时代", "让我们一起期待",
  "未来可期", "前景广阔", "充满无限可能",
  "值得期待", "任重道远", "前途光明",

  // ── 空洞动宾搭配 ──
  "注入新的活力", "带来深刻变革", "产生深远影响",
  "提供有力支撑", "发挥重要作用", "作出积极贡献",
  "实现质的飞跃", "迈出坚实步伐", "谱写新篇章",

  // ── Emoji 堆砌标志 ──
  "✨✨✨", "🔥🔥🔥", "💪💪💪", "🎉🎉🎉", "❤️❤️❤️",

  // ── AI 典型句式标志 ──
  "作为一个AI", "作为人工智能", "我无法",
  "需要注意的是", "需要指出的是", "值得一提的是",
  "其实不然", "我们可以发现", "不难看出", "顾名思义", "换句话说", "不得不说", "不可否认",
  "今天这期视频，我来教你", "今天我们就来聊聊", "今天我给大家分享", "带你了解",
]

// ─── 空洞排比句式正则 ─────────────────────────────────────
export const AI_PATTERN_REGEXES: RegExp[] = [
  /不仅.{2,8}而且.{2,8}更/g,               // 不仅...而且...更...
  /无论是.{2,8}还是.{2,8}都/g,              // 无论是...还是...都...
  /一方面.{2,15}另一方面.{2,15}/g,           // 一方面...另一方面...
  /首先.{2,15}其次.{2,15}最后/g,            // 首先...其次...最后...
  /(非常|特别|极其|相当).{0,4}(重要|关键|核心)/g,  // 堆砌强调
  /在.{2,6}的(背景|趋势|时代|浪潮)下/g,     // 在...的背景下
  /为您(提供|带来|呈现|打造).{4,20}/g,       // 为您提供...
  /[\u{1F300}-\u{1F9FF}]{3,}/gu,             // 连续3个以上emoji
]

// ─── 评分结果接口 ─────────────────────────────────────────
export interface AITasteResult {
  score: number            // 1-10，10 = 完全人类化，1 = 重度AI味
  forbiddenWordHits: string[]  // 命中的禁词列表
  patternHits: string[]        // 命中的句式列表
  suggestions: string[]        // 改进建议
}

/**
 * 检测文案的 AI 味程度
 * @param content 文案内容
 * @returns AI 味评分结果
 */
/**
 * @description 检测aitaste
 * @param content - 内容
 * @returns AITasteResult
 */
export function detectAITaste(content: string): AITasteResult {
  const hits: string[] = []
  const patternHits: string[] = []
  const suggestions: string[] = []

  // 1. 禁词检测
  for (const word of AI_FORBIDDEN_WORDS) {
    if (content.includes(word)) {
      hits.push(word)
    }
  }

  // 2. 句式检测
  for (const regex of AI_PATTERN_REGEXES) {
    const matches = content.match(regex)
    if (matches) {
      patternHits.push(...matches)
    }
  }

  // 3. 计算扣分
  let deduction = 0

  // 禁词扣分：每个扣 0.5 分
  deduction += hits.length * 0.5

  // 句式扣分：每个扣 1 分
  deduction += patternHits.length * 1.0

  // 禁词密度惩罚：超过 5 个额外扣分
  if (hits.length > 5) {
    deduction += (hits.length - 5) * 0.3
  }

  // Emoji 堆砌额外惩罚
  const emojiCount = (content.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length
  const textLength = content.replace(/\s/g, "").length
  if (textLength > 0 && emojiCount / textLength > 0.05) {
    deduction += 1.0
    suggestions.push("Emoji 使用过多，建议减少 Emoji 数量")
  }

  // 4. 生成建议
  if (hits.length > 0) {
    const topHits = hits.slice(0, 5)
    suggestions.push(`检测到 AI 高频词: "${topHits.join("、")}"${hits.length > 5 ? `等 ${hits.length} 个` : ""}，建议替换为更口语化的表达`)
  }

  if (patternHits.length > 0) {
    suggestions.push("检测到 AI 典型句式（排比/书面化），建议改用自然的口语表达")
  }

  // 5. 检测书面化程度（长句比例）
  const sentences = content.split(/[。！？；]/).filter(s => s.trim().length > 0)
  const longSentences = sentences.filter(s => s.length > 40)
  if (sentences.length > 0 && longSentences.length / sentences.length > 0.5) {
    deduction += 0.5
    suggestions.push("长句过多，建议拆分为短句，增加口语节奏感")
  }

  // 6. 计算最终分数（满分 10）
  const score = Math.max(1, Math.min(10, Math.round((10 - deduction) * 10) / 10))

  if (score < 6) {
    suggestions.push("整体 AI 味较重，建议大幅修改为更自然的口语风格")
  } else if (score < 8) {
    suggestions.push("部分表达仍有 AI 痕迹，建议针对性修改")
  }

  return {
    score,
    forbiddenWordHits: hits,
    patternHits,
    suggestions: suggestions.length > 0 ? suggestions : ["AI 味检测通过"],
  }
}