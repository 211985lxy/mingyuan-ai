import type { CandidateScore, ScriptGenerationResult } from "./contracts"

/**
 * @description 构建generationresult
 * @param candidates - candidates
 * @param scores - scores
 * @param promptText - 提示词文本
 * @param model - 模型
 * @returns ScriptGenerationResult
 */
export function buildGenerationResult(
  candidates: string[],
  scores: CandidateScore[],
  promptText: string,
  model: string,
): ScriptGenerationResult {
  const indexed = candidates.map((candidate, index) => ({
    candidate,
    score: scores[index],
  }))
  indexed.sort((a, b) => b.score.overall - a.score.overall)

  return {
    candidates: indexed.map((item) => item.candidate),
    scores: indexed.map((item) => item.score),
    promptText,
    model,
    isDegraded: indexed.length === 0 || indexed[0].score.overall < 60,
  }
}

/**
 * @description withtimeout
 * @param promise - Promise
 * @param ms - ms
 * @param label - 标签
 * @returns Promise<T>
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[script-generator] ${label} timed out after ${ms}ms`)),
      ms,
    )
    promise
      .then((v) => { clearTimeout(timer); resolve(v) })
      .catch((e) => { clearTimeout(timer); reject(e) })
  })
}
