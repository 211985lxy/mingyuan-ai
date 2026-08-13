import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import { executeGenerateLLM } from "@/lib/aim-agent-model"
import type { AimModelPolicy } from "@/lib/aim-harness/types"

export type AimSemanticDeliveryVerdict = { passed: true } | { passed: false; gaps: string[] }

const SEMANTIC_VERIFIER_SYSTEM_PROMPT = `
你是独立交付验收器，不参与创作，不猜测执行器的思路。
只对照当前用户原话、必要的当前作品与相关来源，判断候选是否真正交付。
检查交付对象、数量、完整度、范围、应保留内容、截断、自相矛盾，以及是否用分析或任务复述代替交付。
不从固定内容动作枚举推导标准，验收标准必须由当前原话动态推导。
通过时只输出 [[AIM_VERDICT:PASS]]。
不通过时输出 [[AIM_VERDICT:REVISE]] 和 [[AIM_GAPS]]...[[/AIM_GAPS]]，每条缺口必须具体、可执行。
`.trim()

export class AimSemanticDeliveryError extends Error {
  constructor() {
    super("连续修正后仍未完成当前要求")
    this.name = "AimSemanticDeliveryError"
  }
}

export function parseAimSemanticDeliveryVerdict(text: string): AimSemanticDeliveryVerdict {
  if (/\[\[AIM_VERDICT:PASS\]\]/.test(text)) return { passed: true }
  if (!/\[\[AIM_VERDICT:REVISE\]\]/.test(text)) {
    return { passed: false, gaps: ["验收器未返回可解析结论"] }
  }
  const block = text.match(/\[\[AIM_GAPS\]\]([\s\S]*?)\[\[\/AIM_GAPS\]\]/)?.[1] ?? ""
  const gaps = block.split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 8)
  return { passed: false, gaps: gaps.length ? gaps : ["验收器未返回可解析结论"] }
}

export async function verifyAimDelivery(input: {
  envelope: AimContentSourceEnvelope
  candidate: string
  agentId: string
  modelPolicy?: AimModelPolicy
  complete?: (systemPrompt: string, userPrompt: string) => Promise<{ content: string }>
}): Promise<AimSemanticDeliveryVerdict> {
  const conversation = input.envelope.relevantConversation
    .map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content}`)
    .join("\n\n")
  const references = input.envelope.referenceMaterials
    .map((item) => `【参考材料：${item.title}】\n${item.content}`)
  const userPrompt = [
    `【当前用户原话】\n${input.envelope.currentUserRequest}`,
    conversation ? `【最近相关对话】\n${conversation}` : "",
    input.envelope.currentArtifact ? `【当前作品】\n${input.envelope.currentArtifact.content}` : "",
    ...references,
    `【候选交付】\n${input.candidate}`,
  ].filter(Boolean).join("\n\n")
  const completion = input.complete
    ? await input.complete(SEMANTIC_VERIFIER_SYSTEM_PROMPT, userPrompt)
    : await executeGenerateLLM(
        input.agentId,
        SEMANTIC_VERIFIER_SYSTEM_PROMPT,
        userPrompt,
        input.modelPolicy ? { ...input.modelPolicy, temperature: 0 } : undefined,
      )
  return parseAimSemanticDeliveryVerdict(completion.content)
}

export function buildAimSemanticRevisionPrompt(input: { originalPrompt: string; gaps: string[] }) {
  return [
    input.originalPrompt,
    "上一版未通过独立验收，请直接重做最终交付。",
    "当前用户原话仍是唯一最高真源。",
    `验收缺口：\n${input.gaps.map((gap) => `- ${gap}`).join("\n")}`,
    "不解释修改过程，只输出符合最终内容协议的完整结果。",
  ].join("\n\n")
}

export async function runAimSemanticRevisionLoop<T>(input: {
  execute: (gaps: string[], attempt: number) => Promise<T>
  verify: (candidate: T) => Promise<AimSemanticDeliveryVerdict>
  maxRevisions: number
}): Promise<T> {
  let gaps: string[] = []
  for (let attempt = 0; attempt <= input.maxRevisions; attempt += 1) {
    const candidate = await input.execute(gaps, attempt)
    const verdict = await input.verify(candidate)
    if (verdict.passed) return candidate
    gaps = verdict.gaps
  }
  throw new AimSemanticDeliveryError()
}
