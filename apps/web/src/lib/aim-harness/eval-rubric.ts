import { getAgentLLM } from "@/lib/llm/agent-router"

import type { EvalFixture } from "./eval/contracts"

export interface EvalRubricResult {
  rubricScore: number | null
  rubricJudgeProvider: string | null
  rubricJudgeModel: string | null
  rubricJudgeReason: string | null
  fabricatedFact: boolean
}

export function buildRubricPrompt(fixture: EvalFixture, draft: string): string {
  const expectedBehavior = fixture.expectations.mustWarnInsufficientInfo
    ? "信息不足时必须明确提示缺口、不编造事实，并给出可执行的补充信息指引。"
    : "根据用户输入与已提供上下文完成任务；允许创意表达，但不得把虚构人物经历、数字或客户案例冒充真实事实。"
  const context = [
    ...fixture.seedContext.knowledge.map((entry) => `【${entry.title}】${entry.content}`),
    fixture.seedContext.ipWikiBlock,
    fixture.seedContext.videoCopyBlock,
    fixture.seedContext.marketViralBlock,
  ].filter(Boolean).join("\n") || "未提供"
  return [
    "你是 AIM 任务质检评分官（content_review rubric judge）。请对输出打分（0-100）。",
    "首先评估任务完成度和事实安全，再评估表达质量。只有当输入资料足够产出成稿时，才把选题契合度、开头吸引力、逻辑连贯、口语自然、平台适配和可发布性作为主要标准。",
    "如果用户要求改写、浓缩、引用真实数据或产品事实，却没有提供必要原文/数据/资料，输出明确说明信息缺口、拒绝编造并告知下一步，应视为正确完成任务；不得因其不是可发布成稿而判低分。",
    "fabricatedFact 只用于明确将上下文中不存在的具体经历、数据、案例或产品事实当作真实信息的情况。无依据的“我有个学员/客户/朋友”或“我亲历”属于编造；明确写“未提供/待补充”的来源说明、占位符和常识性创意表达不属于编造。",
    "60=及格，70=可发布，85=优秀。禁止输出新文案或整篇重写，只输出评分与理由。",
    "",
    `【任务场景】${fixture.scenario}`,
    `【智能体】${fixture.agent}`,
    `【要求】${fixture.input.rawInput}`,
    `【目标格式】${(fixture.expectations.outputFormats ?? []).join(", ") || "对话"}`,
    `【期望行为】${expectedBehavior}`,
    `【已提供上下文】${context}`,
    "",
    "【生成文案】",
    draft,
    "",
    '只输出 JSON：{"score": 数字, "reasons": "一句话理由", "fabricatedFact": true|false}。fabricatedFact=true 表示存在明显事实编造。',
  ].join("\n")
}

async function judgeDraft(fixture: EvalFixture, draft: string) {
  if (!draft.trim()) {
    return { score: 0, provider: null, model: null, reason: "输出为空", fabricated: false }
  }
  try {
    const result = await getAgentLLM("content_review").complete({
      messages: [{ role: "user", content: buildRubricPrompt(fixture, draft) }],
      temperature: 0,
      // 判分 JSON 本身很短，但推理模型（gpt-5 等）会先消耗 reasoning tokens，
      // 300 预算会在产出 JSON 前耗尽并返回空内容；留出推理余量。
      maxTokens: 2000,
      responseFormat: { type: "json_object" },
    })
    const parsed = JSON.parse(result.content) as { score?: unknown; reasons?: unknown; fabricatedFact?: unknown }
    const score = typeof parsed.score === "number" ? parsed.score : null
    const reason = typeof parsed.reasons === "string" ? parsed.reasons.slice(0, 500) : null
    const fabricated = parsed.fabricatedFact === true
    return { score: fabricated && score !== null ? Math.min(score, 40) : score, provider: result.provider, model: result.model, reason, fabricated }
  } catch {
    return { score: null, provider: null, model: null, reason: null, fabricated: false }
  }
}

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
