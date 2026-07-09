const AIM_GENERATE_INPUT_MARKER = "【本次生成输入】"

const DIRECT_DRAFT_PATTERNS = [
  "直接生成文案",
  "直接生成长文",
  "直接写文案",
  "直接写正文",
  "直接写长文",
  "直接给我文案",
  "直接给我全文",
  "直接出稿",
  "直接成稿",
  "不要框架",
  "别给框架",
  "不用先框架",
  "不用分析",
  "不用再分析",
  "不要分析",
  "不要再分析",
  "别分析了",
  "别再分析",
  "不要再问",
  "别问了",
]

function normalizeForMatch(text: string) {
  return text.replace(/\s+/g, "")
}

export function extractLatestAimUserIntentText(raw: string): string {
  const text = raw.trim()
  if (!text) return ""

  const markerIndex = text.lastIndexOf(AIM_GENERATE_INPUT_MARKER)
  if (markerIndex >= 0) {
    const section = text.slice(markerIndex + AIM_GENERATE_INPUT_MARKER.length).trim()
    if (section) return section
  }

  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line.startsWith("用户：")) {
      const content = line.slice("用户：".length).trim()
      if (content) return content
    }
  }

  return text
}

export function hasExplicitDirectDraftIntent(raw: string): boolean {
  const text = normalizeForMatch(extractLatestAimUserIntentText(raw))
  return DIRECT_DRAFT_PATTERNS.some((pattern) => text.includes(pattern))
}

const WECHAT_DRAFT_PATTERNS = [
  "推到草稿箱",
  "推到公众号草稿箱",
  "保存到草稿箱",
  "发布到公众号",
  "推到公众号",
]

export function hasWechatDraftIntent(raw: string): boolean {
  const text = normalizeForMatch(raw)
  return WECHAT_DRAFT_PATTERNS.some((pattern) => text.includes(pattern))
}
