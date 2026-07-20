import { LLMClient, type ChatMessage, type LLMProvider } from "@/lib/llm"
import { cleanVideoCopyAnalysisMarkdown } from "@/lib/video-copy-display"

export interface VideoCopyAnalysisInput {
  title?: string | null
  platform?: string | null
  videoDuration?: string | null
  transcript: string
}

export interface VideoCopyAnalysis {
  /** 纯 Markdown 格式的四维拆解，包含结构拆解、心理拆解、商业拆解、迁移应用 */
  markdown: string
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？!?])\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function buildFallbackStructureEffect(): string {
  return "结构作用：文案动作：承接上一个信息点，继续推进冲突、解释或判断。用户心理：让用户顺着问题继续追问原因。商业意图：把泛泛看热闹的人筛成愿意理解方法的人。可复用模板：先抛出现象，再拆关键原因，最后落到可判断的结论。"
}

/**
 * @description 构建fallbackvideocopyanalysis
 * @param input - 输入数据
 * @returns VideoCopyAnalysis
 */
export function buildFallbackVideoCopyAnalysis(input: VideoCopyAnalysisInput): VideoCopyAnalysis {
  const sentences = splitSentences(input.transcript)
  const hook = sentences[0] ?? input.transcript.slice(0, 80)
  const bodyEnd = sentences.length > 4 ? sentences.length - 2 : sentences.length - 1
  const methodMatches = [
    input.transcript.match(/第一个[，,、\s]*[^。！？!?]{2,30}/),
    input.transcript.match(/第二[，,、\s]*[^。！？!?]{2,30}/),
    input.transcript.match(/第三(?:招|个)?[，,、\s]*[^。！？!?]{2,30}/),
  ]
  const methodSections = methodMatches.every(Boolean)
    ? methodMatches.map((match, index) => [
        `### 约${(index + 1) * 12}-${(index + 2) * 12}秒：${match![0]}`,
        `原文片段：${input.transcript.slice(match!.index, Math.min(input.transcript.length, match!.index! + 180))}`,
        buildFallbackStructureEffect(),
        "",
      ].join("\n"))
    : sentences.slice(1, bodyEnd).slice(0, 6).map((sentence, index) => [
        `### 约${(index + 1) * 12}-${(index + 2) * 12}秒：${sentence.slice(0, 18)}`,
        `原文片段：${sentence}`,
        buildFallbackStructureEffect(),
        "",
      ].join("\n"))

  return {
    markdown: cleanVideoCopyAnalysisMarkdown([
      "## 结构拆解",
      "",
      `### 约0-12秒：开头钩子\n${hook}`,
      "",
      ...methodSections,
      "",
      `### 约${Math.max(0, (sentences.length - 2) * 12)}-${Math.max(12, sentences.length * 12)}秒：结尾收束\n${sentences.slice(-2).join("\n") || "结尾待分析"}`,
      "",
      "## 心理拆解",
      "",
      "围绕用户痛点、经验判断和行动建议展开心理驱动。",
      "",
      "## 商业拆解",
      "",
      "适合引导用户收藏、评论或继续查看完整方法。",
      "",
      "## 迁移应用",
      "",
      "### 再创作建议",
      `可借：${hook}`,
      "必须重构：把原文案例、句式和行动引导换成自己的行业场景、人设立场和业务承接。",
      "原创风险：不要照搬原文开头、段落顺序和金句；至少完成结构重构、观点重构和表达重构。",
      "",
      '按"结论→背景→步骤→提醒→行动"的顺序改写成自己的案例。',
      "",
      "### 模仿建议",
      "1. 保留开头判断",
      "2. 替换为自己的行业案例",
      "3. 把步骤改成可执行清单",
      "",
      "### 风险提醒",
      "> 不要照搬原文；涉及平台规则和收益判断时避免绝对化表达。",
    ].join("\n")),
  }
}

/**
 * @description 构建videocopyanalysismessages
 * @param input - 输入数据
 * @returns ChatMessage[]
 */
export function buildVideoCopyAnalysisMessages(input: VideoCopyAnalysisInput): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是"爆款内容商业拆解顾问"，擅长拆解短视频、图文、口播文案、销售文案和个人IP内容。

你的任务不是总结原文，而是分析这条内容为什么有效、它如何推动用户心理、它背后的商业目的是什么，以及用户如何把它迁移到自己的行业和账号中，完成爆款选题再创作。

你必须始终围绕四个目标进行分析：

1. 结构拆解：拆出内容的开头、正文、转折、结尾、节奏和表达方式。
2. 心理拆解：拆出内容如何制造好奇、焦虑、信任、共鸣、期待和行动。
3. 商业拆解：判断这条内容吸引什么人、筛选什么人、建立什么信任、预埋什么产品、适合承接什么转化。
4. 迁移应用：把原文结构抽象成可复用模板，并根据用户的行业、人设、产品给出再创作方向。

分析时必须遵守以下规则：

- 不要只总结原文。
- 不要只提炼金句。
- 不要泛泛而谈"这个开头很吸引人"。
- 每个判断都要说明"为什么有效"。
- 必须识别核心选题、开头机制、观点冲突和情绪触发点；学习机制，不复制句子。
- 信息要克制，宁可少而准；原文片段必须完整，结构作用必须拆出机制，不要复述原文。
- 结构拆解是重点，必须按时间轴拆细；每 12 秒左右输出一个 ### 节点，不设置 6-8 个节点上限。
- 如果原文自带时间戳，严格按 12 秒时间段合并相邻句；如果没有时间戳，根据文案顺序和视频时长估算时间段。
- 节点标题必须使用"时间段 + 结构动作"，例如"### 00:00-00:12：反常结果开场"；禁止输出"正文-1"、"正文第一部分"这种空标题。
- 如果原文出现"第一/第二/第三"、"三大方法"、"三个心法"、"三步"、"三类"等枚举结构，每个枚举点都要单独成节点；不要合并成一段正文。
- 每个结构子节点只保留两项：原文片段、结构作用。
- 原文片段必须引用该节点开头的连续原文，保持必要完整；不要只写概括。
- 结构作用必须按"文案动作 / 用户心理 / 商业意图 / 可复用模板"四点写清楚。不要只写"制造好奇"、"建立信任"这种空话。
- 文案动作要说明这一句在做什么：抛反常、立冲突、拆误区、补因果、给判断、埋需求、收承诺。
- 用户心理要说明用户为什么会继续看：被戳中什么困惑、担心、好奇、反常结果或自我代入。
- 商业意图要说明它在筛选什么客户、预埋什么服务认知、把用户往哪一步转化。
- 可复用模板要抽象成一句可迁移句式，方便换行业重写。
- 结构子节点标题要具体，必须体现时间段和结构动作，例如"### 00:24-00:36：用反向解释补足因果链"。
- 不要使用 **加粗星号** 标记字段名；字段直接写"原文片段："、"结构作用："。
- 禁止输出"心理作用："、"迁移保留点："这两类字段。
- 结构层级直接用 Markdown 标题：## 作为章节，### 作为结构节点，不要用加粗文字伪装标题。
- 如果原文有转化意图，必须指出它的成交路径。
- 如果原文不适合用户直接模仿，必须明确提醒风险。
- 迁移应用必须包含少量可见 SOP：可借什么、必须重构什么、原创风险是什么。
- 心理拆解、商业拆解、迁移应用不是重点，每节最多 2 条短句；把主要篇幅留给结构拆解。
- 输出要具体、可执行、适合内容创作者直接使用，但不要超过必要信息量。

输出格式：纯 Markdown，不要 JSON 包裹。
全文以四个二级标题组织：

- ## 结构拆解
- ## 心理拆解
- ## 商业拆解
- ## 迁移应用

每个章节内可以使用 ### 三级标题、- 列表、> 引用等 Markdown 语法增强可读性；不要使用 ** 星号加粗。`,
    },
    {
      role: "user",
      content: [
        `平台：${input.platform || "unknown"}`,
        `标题：${input.title || "未提供"}`,
        `视频时长：${input.videoDuration || "未提供，请按文案长度估算 12 秒片段"}`,
        "视频文案：",
        input.transcript,
        "",
        "请按照「爆款内容商业拆解顾问」的角色要求，输出完整的四维拆解。",
      ].join("\n"),
    },
  ]
}

/**
 * @description 解析videocopyanalysis
 * @param content - 内容
 * @returns VideoCopyAnalysis
 */
export function parseVideoCopyAnalysis(content: string): VideoCopyAnalysis {
  // LLM 现在直接输出纯 Markdown，不再包裹 JSON
  const trimmed = content
    .replace(/\*\*([^*\n：:]{2,24})\*\*([：:])/g, "$1$2")
    .replace(/\*\*/g, "")
  const markdown = cleanVideoCopyAnalysisMarkdown(trimmed)
  if (markdown.length < 50) {
    throw new Error("结构化分析失败，请稍后重试。")
  }
  return { markdown }
}

/**
 * @description 分析videocopy
 * @param input - 输入数据
 * @param provider - provider
 * @returns Promise<VideoCopyAnalysis>
 */
export async function analyzeVideoCopy(
  input: VideoCopyAnalysisInput,
  provider: LLMProvider | LLMClient = LLMClient.shared()
): Promise<VideoCopyAnalysis> {
  const result = await provider.complete({
    messages: buildVideoCopyAnalysisMessages(input),
    temperature: 0.2,
    maxTokens: 3200,
  })

  try {
    return parseVideoCopyAnalysis(result.content)
  } catch {
    return buildFallbackVideoCopyAnalysis(input)
  }
}
