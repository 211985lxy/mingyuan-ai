import { buildTaskSpecLLMPrompt, sanitizeLLMRefinement, type TaskSpec } from "@/lib/task-spec"

export interface LLMRefineClient {
  complete(prompt: string): Promise<string>
}

export interface RefineOptions {
  client?: LLMRefineClient
  enabled: boolean
}

/**
 * 对骨架做 LLM 精化（仅风险非 low 时）。
 * 任何失败（无 client / 超时 / 解析失败 / 校验失败）都退回骨架，classifiedBy=rule_fallback。
 */
export async function refineTaskSpec(skeleton: TaskSpec, opts: RefineOptions): Promise<TaskSpec> {
  if (!opts.enabled) return skeleton
  if (skeleton.riskLevel === "low") return skeleton // 低风险不调用
  if (!opts.client) return { ...skeleton, classifiedBy: "rule_fallback" }

  try {
    const raw = await opts.client.complete(buildTaskSpecLLMPrompt(skeleton))
    const parsed = JSON.parse(raw)
    return sanitizeLLMRefinement(skeleton, parsed)
  } catch {
    return { ...skeleton, classifiedBy: "rule_fallback" }
  }
}
