import type { CompiledWikiPage } from "@/lib/ip-wiki/compile"

/**
 * 爆款方法论编译器
 *
 * 把竞品分析文本编译成一份结构化「爆款方法论」文档，
 * 遵循 IP Wiki compile.ts 的模式，供下游内容生产使用。
 */

export interface MethodologyCompileInput {
  /** 竞品分析全文 */
  competitorAnalysisText: string
  /** 当前项目名称，用于上下文 */
  projectName?: string
  /** 竞品来源 ID，用于 sources 溯源 */
  sourceCompetitorId?: string
}

const MAX_INPUT_CHARS = 5000

function truncateInput(text: string): string {
  return text.slice(0, MAX_INPUT_CHARS)
}

export function buildMethodologyCompilePrompt(
  input: MethodologyCompileInput
): string {
  const analysis = truncateInput(input.competitorAnalysisText)

  return `你是一个「爆款方法论」编译器。你的任务是把一份竞品分析文本编译成一份结构化的「爆款方法论」文档，供下游内容生产官在创作时直接读取作为方法论参考。

## 输入

项目名称：${input.projectName ?? "（未提供）"}
${input.sourceCompetitorId ? `竞品来源 ID：${input.sourceCompetitorId}` : ""}

竞品分析全文：
"""
${analysis}
"""

## 输出要求

请从竞品分析中提炼出可复用的爆款方法论，必须包含以下内容结构板块：

1. **开头打法**：竞品如何在开头 3 秒内抓住注意力（钩子模式、痛点提问、数字吸引、悬念设置等）
2. **中段推进**：中段如何维持观看/阅读（情绪曲线、案例穿插、节奏把控等）
3. **结尾收束**：结尾如何推动转化或留存（号召关注、引导私域、激发分享等）
4. **爆点迁移清单**：提炼 5-10 个可迁移到本项目的爆点要素（如「痛点迁移」「案例迁移」「情绪迁移」等）
5. **适用场景标签**：该方法论适用于哪些内容类型或场景（如「教育类」「种草类」「知识分享类」等）

## 规则

- content 为凝练后的方法论正文，去 AI 味、干练实用
- frontmatter 按需放置结构化元数据（如 competitorSource）
- sources 标注信息来源。来自竞品分析的写 { kind: "aim_generation", id: "${input.sourceCompetitorId ?? ""}", label: "竞品分析" }
- links 用页 title 列表标注本页应交叉引用到的其它维基页

## 输出格式（严格 JSON 数组，不要 markdown 代码块）

[
  {
    "pageType": "viral_methodology",
    "title": "爆款方法论标题",
    "content": "## 开头打法\\n...\\n## 中段推进\\n...\\n## 结尾收束\\n...\\n## 爆点迁移清单\\n- ...\\n## 适用场景标签\\n...",
    "frontmatter": {},
    "sources": [{ "kind": "aim_generation", "id": "${input.sourceCompetitorId ?? ""}", "label": "竞品分析" }],
    "links": []
  }
]

若竞品分析信息不足以产出方法论，返回空数组 []。`
}

export function parseMethodologyCompileResponse(
  raw: string
): CompiledWikiPage[] {
  if (!raw || !raw.trim()) return []

  try {
    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item: Record<string, unknown>) => item.pageType === "viral_methodology")
      .map((item: Record<string, unknown>) => ({
        pageType: item.pageType as CompiledWikiPage["pageType"],
        title: typeof item.title === "string" ? item.title.trim().slice(0, 80) : "",
        content: typeof item.content === "string" ? item.content.trim().slice(0, 3500) : "",
        frontmatter:
          item.frontmatter && typeof item.frontmatter === "object"
            ? (item.frontmatter as Record<string, unknown>)
            : {},
        sources: Array.isArray(item.sources)
          ? item.sources
              .filter(
                (s: Record<string, unknown>) =>
                  s &&
                  typeof s === "object" &&
                  (s.kind === "aim_generation" || s.kind === "knowledge_entry") &&
                  typeof s.id === "string" &&
                  s.id.trim()
              )
              .map((s: Record<string, unknown>) => ({
                kind: s.kind as "aim_generation" | "knowledge_entry",
                id: String(s.id).trim(),
                label: typeof s.label === "string" ? String(s.label).trim().slice(0, 60) : undefined,
              }))
              .slice(0, 10)
          : [],
        links: Array.isArray(item.links)
          ? item.links
              .filter((l: unknown) => typeof l === "string" && l.trim())
              .map((l: unknown) => String(l).trim())
              .slice(0, 30)
          : [],
      }))
      .filter(
        (page: CompiledWikiPage) => page.title && page.content
      ) as CompiledWikiPage[]
  } catch {
    return []
  }
}
