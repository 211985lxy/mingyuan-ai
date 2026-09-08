import type { CompiledWikiPage } from "@/lib/ip-wiki/compile"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

/**
 * 爆款方法论编译器
 *
 * 把竞品分析文本编译成一份绑定当前项目的「项目爆款策略」文档，
 * 遵循 IP Wiki compile.ts 的模式，供该客户项目下游内容生产使用。
 * 这不是全局方法论源，不会进入公共方法论库。
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

/**
 * @description 构建methodologycompileprompt
 * @param input - 输入数据
 * @returns string
 */
export function buildMethodologyCompilePrompt(
  input: MethodologyCompileInput
): string {
  const analysis = truncateInput(input.competitorAnalysisText)

  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.competitorMethodologyCompile).content,
    {
      projectName: input.projectName ?? "（未提供）",
      sourceCompetitorBlock: input.sourceCompetitorId ? `竞品来源 ID：${input.sourceCompetitorId}` : "",
      analysis,
      sourceCompetitorId: input.sourceCompetitorId ?? "",
    },
  )
}

/**
 * @description 解析methodologycompileresponse
 * @param raw - 原始数据
 * @returns CompiledWikiPage[]
 */
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
