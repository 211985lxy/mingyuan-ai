export type TopicChatCategory = "daily_inspiration" | "user_insight" | "benchmark_reference"

export type TopicChatClassification = {
  category: TopicChatCategory
  reason: string
}

export type TopicKnowledgeDraft = {
  category: TopicChatCategory
  title: string
  content: string
  tags: string[]
  sourceType: "manual" | "import"
}

export type TopicChatCard = {
  title: string
  hook?: string
  angle?: string
  rationale?: string
}

export type TopicChatReply = {
  summary: string
  recommendedTitle: string
  opening: string
  alternatives: string[]
  nextActionLabel: string
}

function compactTitle(content: string) {
  return content
    .replace(/^今天客户又问我/, "")
    .replace(/^客户(问|说|担心)/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 28)
}

export function classifyTopicChatInput(content: string): TopicChatClassification {
  const text = content.trim()
  if (/https?:\/\/|爆款|对标|参考|链接|标题|开头/.test(text)) {
    return { category: "benchmark_reference", reason: "对标素材或外部参考" }
  }
  if (/客户|用户|顾虑|担心|为什么|报价|成交|咨询|评论|问题|异议/.test(text)) {
    return { category: "user_insight", reason: "客户问题或成交顾虑" }
  }
  return { category: "daily_inspiration", reason: "日常灵感或现场想法" }
}

export function buildTopicKnowledgeDraft(input: {
  content: string
  classification: TopicChatClassification
}): TopicKnowledgeDraft {
  const content = input.content.trim()
  const titleCore = compactTitle(content) || "客户输入"
  if (input.classification.category === "user_insight") {
    return {
      category: "user_insight",
      title: `客户问题：${titleCore}`,
      content,
      tags: ["topic_chat", "auto_captured", "asset_role:pain"],
      sourceType: "manual",
    }
  }
  if (input.classification.category === "benchmark_reference") {
    return {
      category: "benchmark_reference",
      title: `参考素材：${titleCore}`,
      content,
      tags: ["topic_chat", "auto_captured", "asset_role:benchmark"],
      sourceType: "import",
    }
  }
  return {
    category: "daily_inspiration",
    title: `日常灵感：${titleCore}`,
    content,
    tags: ["topic_chat", "auto_captured", "asset_role:idea"],
    sourceType: "manual",
  }
}

export function buildTopicChatReply(input: {
  savedTitle: string
  cards: TopicChatCard[]
}): TopicChatReply {
  const lead = input.cards[0]
  const alternatives = input.cards.slice(1, 3).map((card) => card.title)
  return {
    summary: `这句话已经沉淀为：${input.savedTitle}`,
    recommendedTitle: lead?.title || "先把这个问题讲透",
    opening: lead?.hook || lead?.rationale || "先从客户最关心的问题开口，再讲你的判断和解决办法。",
    alternatives,
    nextActionLabel: "继续写成口播稿",
  }
}
