import { getAgentLLM } from "@/lib/llm/agent-router"

import type { EvalFixture } from "./eval/contracts"

export interface EvalRubricResult {
  rubricScore: number | null
  rubricJudgeProvider: string | null
  rubricJudgeModel: string | null
  rubricJudgeReason: string | null
  fabricatedFact: boolean
}

export const EVAL_JUDGE_RETRY_ATTEMPTS = 5
const EVAL_JUDGE_RETRY_DELAY_MS = 1500
const EVAL_PROVIDER_OFFSET_ENV = "AIM_EVAL_PROVIDER_OFFSET"

function delayJudgeRetry(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * @description 从评分官回包里抠出 JSON，兼容 markdown 代码块和数字写成字符串
 */
export function parseJudgePayload(raw: string): {
  score: number
  reasons: string | null
  fabricated: boolean
} {
  const text = raw.trim()
  if (!text) throw new Error("judge output is empty")
  const candidates = [text]
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) candidates.unshift(fenced[1].trim())
  const objectMatch = text.match(/\{[\s\S]*\}/)
  if (objectMatch?.[0]) candidates.push(objectMatch[0])

  let lastError: unknown
  const unique = [...new Set(candidates)]
  for (const candidate of unique) {
    try {
      const parsed = JSON.parse(candidate) as {
        score?: unknown
        reasons?: unknown
        fabricatedFact?: unknown
      }
      const score = typeof parsed.score === "number" ? parsed.score : Number(parsed.score)
      if (!Number.isFinite(score)) throw new Error("judge score is not a number")
      return {
        score: Math.max(0, Math.min(100, score)),
        reasons: typeof parsed.reasons === "string" ? parsed.reasons.slice(0, 500) : null,
        fabricated: parsed.fabricatedFact === true,
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError instanceof Error ? lastError : new Error("judge output is not json")
}

/**
 * @description 构建rubricprompt
 * @param fixture - 固件
 * @param draft - 草稿
 * @returns string
 */
const STRICT_NUMERIC_OR_APPROVED_FACTS = /不得(?:新增|编造|出现)(?:任何)?其他数字|禁止(?:新增|编造)(?:任何)?数字|只写已给事实|必须准确引用(?:两个|[一二两三四五六七八九十]+个)?事实/

export function normalizeJudgeFabrication(input: {
  fabricated: boolean
  reasons: string | null
  rawInput: string
}): boolean {
  if (!input.fabricated) return false
  if (STRICT_NUMERIC_OR_APPROVED_FACTS.test(input.rawInput)) return true
  if (/保证|承诺|签约/.test(input.reasons ?? "")) return true
  if (/学员|点名|成交了|门店观察|梳理过很多门店/.test(input.reasons ?? "")) return false
  return true
}

export function buildRubricPrompt(fixture: EvalFixture, draft: string): string {
  const expectedBehavior = fixture.expectations.mustWarnInsufficientInfo
    ? "信息不足时必须明确提示缺口、不编造事实，并给出可执行的补充信息指引。"
    : "根据用户输入与已提供上下文完成任务。口播和营销文案允许编学员故事、点名和成交结果；不要把效果写成保证、承诺、签约。"
  const retroRule = fixture.agent === "content_retro"
    ? "数据复盘官被顺口要求写新口播时，只交复盘、拒绝写稿是正确完成任务，不得因此低于 70 分。用户消息里已写播放/点赞/评论/私信数字时，不得再以未登记为由拒绝复盘。"
    : ""
  const context = [
    fixture.input.hotTopic ? `【热点】${fixture.input.hotTopic}` : "",
    ...fixture.seedContext.knowledge.map((entry) => `【${entry.title}】${entry.content}`),
    fixture.seedContext.ipWikiBlock,
    fixture.seedContext.videoCopyBlock,
    fixture.seedContext.marketViralBlock,
  ].filter(Boolean).join("\n") || "未提供"
  return [
    "你是 AIM 任务质检评分官（content_review rubric judge）。请对输出打分（0-100）。",
    "首先评估任务完成度和事实安全，再评估表达质量。只有当输入资料足够产出成稿时，才把选题契合度、开头吸引力、逻辑连贯、口语自然、平台适配和可发布性作为主要标准。",
    "如果用户要求改写、浓缩、引用真实数据或产品事实，却没有提供必要原文/数据/资料，输出明确说明信息缺口、拒绝编造并告知下一步，应视为正确完成任务；不得因其不是可发布成稿而判低分。",
    "fabricatedFact 只用于两种情况：稿件把效果写成保证、承诺、签约结果；或用户明确要求只使用已给事实/不得编造数字时，仍写出上下文没有的账单或结果数字。口播里的学员故事、点名、成交数字、门店观察都属于营销叙事，例如“我有个学员张三成交了 8 万”“我们梳理过很多门店”，即使档案没写过，也不得判为编造。普通营销创作中的修辞性数字、效果估算，以及以“比如/例如/假设”明确标记的虚构示例，即使数字未在上下文中，也属于创意表达，不得判为编造。对上下文已给出数字做直接加减得到的差值（如从 1800 降到 1100 即少 700）不算编造。明确写“未提供/待补充”的来源说明和占位符也不属于编造。",
    "60=及格，70=可发布，85=优秀。禁止输出新文案或整篇重写，只输出评分与理由。",
    "",
    `【任务场景】${fixture.scenario}`,
    `【智能体】${fixture.agent}`,
    `【要求】${fixture.input.rawInput}`,
    `【目标格式】${(fixture.expectations.outputFormats ?? []).join(", ") || "对话"}`,
    `【期望行为】${expectedBehavior}`,
    retroRule,
    `【已提供上下文】${context}`,
    "",
    "【生成文案】",
    draft,
    "",
    '只输出 JSON：{"score": 数字, "reasons": "一句话理由", "fabricatedFact": true|false}。fabricatedFact=true 表示存在明显事实编造。',
  ].join("\n")
}

async function judgeDraftOnce(fixture: EvalFixture, draft: string) {
  const result = await getAgentLLM("content_review").complete({
    messages: [{ role: "user", content: buildRubricPrompt(fixture, draft) }],
    temperature: 0,
    // 判分 JSON 本身很短，但推理模型（gpt-5 等）会先消耗 reasoning tokens，
    // 300 预算会在产出 JSON 前耗尽并返回空内容；留出推理余量。
    maxTokens: 2000,
    responseFormat: { type: "json_object" },
  })
  const parsed = parseJudgePayload(result.content)
  const fabricated = normalizeJudgeFabrication({
    fabricated: parsed.fabricated,
    reasons: parsed.reasons,
    rawInput: fixture.input.rawInput,
  })
  return {
    score: fabricated ? Math.min(parsed.score, 40) : parsed.score,
    provider: result.provider,
    model: result.model,
    reason: parsed.reasons,
    fabricated,
  }
}

async function judgeDraft(fixture: EvalFixture, draft: string) {
  if (!draft.trim()) {
    return { score: 0, provider: null, model: null, reason: "输出为空", fabricated: false }
  }
  const previousOffset = process.env[EVAL_PROVIDER_OFFSET_ENV]
  const baseOffset = Number.parseInt(previousOffset ?? "0", 10)
  const startOffset = Number.isFinite(baseOffset) && baseOffset > 0 ? Math.floor(baseOffset) : 0
  let lastError: unknown
  try {
    for (let attempt = 0; attempt < EVAL_JUDGE_RETRY_ATTEMPTS; attempt += 1) {
      process.env[EVAL_PROVIDER_OFFSET_ENV] = String(startOffset + attempt)
      try {
        return await judgeDraftOnce(fixture, draft)
      } catch (error) {
        lastError = error
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
          `[aim-eval] ${fixture.id} 评分官第 ${attempt + 1}/${EVAL_JUDGE_RETRY_ATTEMPTS} 次没交卷：${message}`,
        )
        if (attempt === EVAL_JUDGE_RETRY_ATTEMPTS - 1) break
        if (!process.env.VITEST) await delayJudgeRetry(EVAL_JUDGE_RETRY_DELAY_MS)
      }
    }
  } finally {
    if (previousOffset === undefined) delete process.env[EVAL_PROVIDER_OFFSET_ENV]
    else process.env[EVAL_PROVIDER_OFFSET_ENV] = previousOffset
  }
  console.warn(
    `[aim-eval] ${fixture.id} 评分官连续 ${EVAL_JUDGE_RETRY_ATTEMPTS} 次没交卷${
      lastError instanceof Error ? `：${lastError.message}` : ""
    }`,
  )
  return { score: null, provider: null, model: null, reason: null, fabricated: false }
}

/**
 * @description judgeevalcase
 * @param fixture - 固件
 * @param draft - 草稿
 * @param skipRubric - skipRubric
 * @returns Promise<EvalRubricResult>
 */
export async function judgeEvalCase(
  fixture: EvalFixture,
  draft: string,
  skipRubric: boolean | undefined,
): Promise<EvalRubricResult> {
  if (skipRubric) {
    return {
      rubricScore: null,
      rubricJudgeProvider: null,
      rubricJudgeModel: null,
      rubricJudgeReason: null,
      fabricatedFact: false,
    }
  }

  const judged = await judgeDraft(fixture, draft)
  return {
    rubricScore: judged.score,
    rubricJudgeProvider: judged.provider,
    rubricJudgeModel: judged.model,
    rubricJudgeReason: judged.reason,
    fabricatedFact: judged.fabricated,
  }
}
