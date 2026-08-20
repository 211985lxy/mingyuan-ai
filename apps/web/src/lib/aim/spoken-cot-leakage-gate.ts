/**
 * 口播正文思维链泄漏闸门。
 *
 * 单格式口播走非统一执行路径时 FORMAT 解析失败、整段原始输出直接当正文
 * （aim-generation-prompts.ts 的单格式 fallback），模型会把任务分析、草稿
 * 标记、自检报告写进交付文案。本模块在生成循环中承担三件事：
 * 1. collectSpokenCotLeakHits：清洗后收集泄漏格式与命中行；
 * 2. buildSpokenCotLeakRetryPrompt：非末次 attempt 的重试提示词；
 * 3. applySpokenCotFinalExtraction：末次 attempt 的成稿提取兜底
 *    （提取后正文过短则抛错拒绝交付，沿用「生成结果被截断」错误模式）。
 */
import type { ContentFormat } from "@/lib/aim-generator"
import { detectSpokenChainOfThoughtLeakage, extractSpokenFinalDraft } from "@/lib/aim-generation-text"

export type SpokenCotLeakHits = Map<ContentFormat, string[]>

export function collectSpokenCotLeakHits(
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
  attempt?: number,
): SpokenCotLeakHits {
  const hits: SpokenCotLeakHits = new Map()
  for (const format of targetFormats) {
    const leaked = detectSpokenChainOfThoughtLeakage(parsed[format] || "")
    if (leaked.length) hits.set(format, leaked)
  }
  if (hits.size) {
    console.warn("[aim-generation] spoken CoT leakage gate", {
      attempt,
      formats: [...hits.keys()],
    })
  }
  return hits
}

export function buildSpokenCotLeakRetryPrompt(userPrompt: string, hits: SpokenCotLeakHits): string {
  const leakSamples = [...hits.values()].flat().slice(0, 5)
  return `${userPrompt}

上一版口播正文混入了任务分析或自检过程文字，例如：
${leakSamples.map((s) => `- ${s}`).join("\n")}

重新输出要求：正文从第一句起就是可直接拍摄的成稿口播；任务分析、结构拆解与质检自检只允许写在 [[AIM_METHOD_NOTE]] 块内，禁止出现「需要先判断…」「用户说…」「写正文草稿：」「检查……：有。」等句式。`
}

/**
 * 末次 attempt 兜底：从泄漏输出中提取成稿并替换 parsed[format]。
 * 返回给用户的 safetyWarning；无法提取出 ≥80 字成稿时抛错拒绝交付。
 */
export function applySpokenCotFinalExtraction(
  parsed: Partial<Record<ContentFormat, string>>,
  hits: SpokenCotLeakHits,
): string {
  for (const format of hits.keys()) {
    const extraction = extractSpokenFinalDraft(parsed[format] || "")
    const extractedBody = extraction.draft
      .replace(/\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/u, "")
      .trim()
    if (extractedBody.length < 80) {
      throw new Error("生成结果混入了任务分析文字且无法提取出完整成稿，已停止交付，请重试本次请求")
    }
    parsed[format] = extraction.draft
  }
  return "成稿已自动清理混入的任务分析/自检文字，请复核内容完整性。"
}
