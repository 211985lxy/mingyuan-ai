import { LLMClient } from "@/lib/llm/client"
import type { ChatMessage } from "@/lib/llm/types"
import { isIpWikiPageType, type IpWikiPageType } from "@/lib/ip-wiki/types"

/**
 * IP 定位维基 · Ingest 编译器
 *
 * Karpathy LLM-Wiki 模式的「编译」步骤：把定位策划官产出的一份定位方案
 * （raw 不可变原始素材）增量编译成一组结构化维基页（AOT 提前编译），
 * 下游 agent 生成时直接读已编译的页，而非每次 JIT 向量检索碎片。
 *
 * 这里只做「提议」——产出建议页，由人工确认后才入库（契合项目「人工确认、不自动入库」约束）。
 */

export interface CompiledWikiPage {
  pageType: IpWikiPageType
  title: string
  content: string
  frontmatter: Record<string, unknown>
  sources: Array<{ kind: "aim_generation" | "knowledge_entry"; id: string; label?: string }>
  links: string[]
}

export interface ExistingWikiPageRef {
  pageType: IpWikiPageType
  title: string
}

export interface CompileWikiInput {
  /** 定位方案全文（来自 BusinessDiagnosisHandler 的 raw_copy） */
  positioningText: string
  /** 当前 IP 营销全案名称，用于上下文 */
  projectName?: string
  /** 已有维基页，让编译器增量感知、尽量更新而非重复 */
  existingPages?: ExistingWikiPageRef[]
  /** 这份定位方案来自哪条 AimGeneration，用于 sources 溯源 */
  sourceGenerationId?: string
}

type RawCompiledPage = {
  pageType?: string
  title?: string
  content?: string
  frontmatter?: unknown
  sources?: unknown
  links?: unknown
}

const MAX_PAGES = 8
const MAX_TITLE_LEN = 80
const MAX_CONTENT_CHARS = 3500

/** 截取定位方案最近片段，控制 prompt 体量 */
function slicePositioning(text: string): string {
  return text.slice(0, 8000)
}

export function buildCompilePrompt(input: CompileWikiInput): string {
  const positioning = slicePositioning(input.positioningText)
  const existing = (input.existingPages ?? [])
    .slice(0, 30)
    .map((p) => `- [${p.pageType}] ${p.title}`)
    .join("\n")

  return `你是一个 IP 定位维基的编译器。你的任务是把一份「IP 定位方案」编译成一组结构化维基页，供下游内容生产官和深度文案官在生成内容时直接读取，作为该 IP 的工作上下文。

这是「提前编译」而不是「即时检索」：你要把定位方案里散落的信息，提炼、归并、交叉引用成凝练的全局维基页，让下游 agent 不必每次重新推导。

## 输入

IP 营销全案：${input.projectName ?? "（未提供）"}
${input.sourceGenerationId ? `定位方案来源 AimGeneration：${input.sourceGenerationId}` : ""}

已有维基页（增量感知，能合并就合并更新，避免重复）：
${existing || "（暂无，首次编译）"}

定位方案全文：
"""
${positioning}
"""

## 必须产出的维基页（每页一个 pageType）

1. positioning（定位主张）：一句话差异化定位口号（Slogan）+ 核心目标受众画像 + 价值承诺。
2. persona（人设）：人设角色（专家/老师/同学/偶像/代言人/段子手）、人设标签、价值锚点、口头禅与记忆点。命理/MBTI 只用于校准风格，不输出玄学断言。
3. content_strategy（内容策略底盘）：frontmatter 必填六个字段——topicDistribution（话题分布，数组 [{topic, percentage}]）、contentFormats（内容形式占比，数组 [{format, percentage}]）、hookPatterns（钩子模式，字符串数组）、postingFrequency（发布频率，字符串）、bestPostingTimes（最佳时段，字符串）、viralFormula（爆款公式，字符串）。正文给出可执行的策略说明。没有数据时按定位方案做「建议比例」估算，必须标明是建议比例，不得伪装成量化事实。
4. audience（目标人群）：核心人群画像、痛点、决策场景、变现方式。
5. conversion_path（成交路径）：从刷到内容到私域成交的路线指引与产品阶梯。
6. topic_direction（选题方向）：基于内容策略底盘推导的 3-5 个核心选题专栏方向。

## 规则

- 每页 title 简短可检索（如「内容策略底盘」「人设：实战型专家」）。
- content 是凝练后的正文（不是复制定位方案原文），去 AI 味、干练。
- links：用页 title 列表标注本页应交叉引用到的其它维基页（双向链接）。
- sources：标注信息来源。来自本定位方案的写 { kind: "aim_generation", id: "${input.sourceGenerationId ?? ""}", label: "定位方案" }。
- frontmatter：只 content_strategy 页必填六个字段；其它页按需放结构化字段或空对象 {}。

## 输出格式（严格 JSON，不要 markdown 代码块）

{
  "pages": [
    {
      "pageType": "content_strategy",
      "title": "内容策略底盘",
      "content": "凝练的策略正文……",
      "frontmatter": {
        "topicDistribution": [{ "topic": "AI工具与教程", "percentage": 40 }],
        "contentFormats": [{ "format": "深度教程/分析", "percentage": 58 }],
        "hookPatterns": ["痛点提问", "数字吸引"],
        "postingFrequency": "每周 3-4 条",
        "bestPostingTimes": "工作日 18:00-21:00",
        "viralFormula": "高价值信息 + 实操教程 + 热点话题 + 强烈情绪"
      },
      "sources": [{ "kind": "aim_generation", "id": "${input.sourceGenerationId ?? ""}", "label": "定位方案" }],
      "links": ["定位主张", "人设"]
    }
  ]
}

若定位方案信息不足以产出某类页，就省略该页，不要编造。返回 {"pages": []} 表示无可编译内容。`
}

function asString(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0)
    .slice(0, 30)
}

function asSources(value: unknown, fallbackGenerationId?: string) {
  const sources: CompiledWikiPage["sources"] = []
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue
      const kind = (item as { kind?: unknown }).kind
      const id = (item as { id?: unknown }).id
      const label = (item as { label?: unknown }).label
      if (
        (kind === "aim_generation" || kind === "knowledge_entry") &&
        typeof id === "string" &&
        id.trim()
      ) {
        sources.push({
          kind,
          id: id.trim(),
          label: typeof label === "string" ? label.trim().slice(0, 60) : undefined,
        })
      }
    }
  }
  // 没有显式来源时，回填定位方案来源
  if (sources.length === 0 && fallbackGenerationId) {
    sources.push({ kind: "aim_generation", id: fallbackGenerationId, label: "定位方案" })
  }
  return sources.slice(0, 10)
}

export function parseCompileJson(raw: string, fallbackGenerationId?: string): CompiledWikiPage[] {
  try {
    const parsed = JSON.parse(raw) as { pages?: RawCompiledPage[] }
    if (!Array.isArray(parsed.pages)) return []

    return parsed.pages
      .map((item) => {
        const pageType = (item.pageType ?? "").trim()
        if (!isIpWikiPageType(pageType)) return null
        const title = asString(item.title, MAX_TITLE_LEN)
        const content = asString(item.content, MAX_CONTENT_CHARS)
        if (!title || !content) return null

        return {
          pageType,
          title,
          content,
          frontmatter:
            item.frontmatter && typeof item.frontmatter === "object"
              ? (item.frontmatter as Record<string, unknown>)
              : {},
          sources: asSources(item.sources, fallbackGenerationId),
          links: asStringArray(item.links),
        }
      })
      .filter((page): page is CompiledWikiPage => page !== null)
      .slice(0, MAX_PAGES)
  } catch {
    return []
  }
}

export async function compilePositioningToWiki(
  input: CompileWikiInput
): Promise<CompiledWikiPage[]> {
  if (!input.positioningText.trim()) return []

  const prompt = buildCompilePrompt(input)
  const completion = await LLMClient.shared().complete({
    messages: [{ role: "user", content: prompt } satisfies ChatMessage],
    maxTokens: 3000,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  })

  return parseCompileJson(completion.content, input.sourceGenerationId)
}
