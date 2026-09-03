/**
 * Assistant 人设画像派生（纯函数 · 不直接落库）。
 *
 * 本文件替代原先不存在的 assistant-persona.ts：作为老板说明书采访的
 * 「persona 同步写入」环节的纯函数实现。调用方拿到返回值后，
 * 再自行通过自己的存储（如 AgentGuide / AimGenerationPersona）落库。
 *
 * Persona 对象刻意保持简单、可 JSON 序列化，不绑定任何具体 Prisma model。
 */

import type { InterviewSixDim } from "@/lib/ip-wiki/boss-brief-types"

export interface InterviewPersona {
  /** 简短经历摘要（200 字以内，bio 字段） */
  bio: string
  /** 人设特征标签：优势 + 适合服务谁 + 表达风格（用于 traits） */
  traits: string[]
  /** 表达方式 / 风格特征：作为 style/tone/voice 派生的源字段 */
  style: string
}

/**
 * 从采访六维画像派生出 assistant persona 对象。
 *
 * @param interviewResult  已校验的六维结果（已由 validateInterviewSixDim 保证字段）
 * @param oldPersona       可选：原有 persona；传入时对冲突字段做并集，避免覆盖历史值。
 */
export function applyInterviewToPersona(
  interviewResult: InterviewSixDim,
  oldPersona?: Partial<InterviewPersona>,
): InterviewPersona {
  const exp = interviewResult.experiences.slice(0, 3)
  const baseLine = exp.join("；")

  const business = interviewResult.business
  // bio：当前业务 + 最具代表性的 3 段经历（≤200 字）
  let bio = `目前在做${business}。${baseLine ? `过往经历：${baseLine}。` : ""}`
    .trim()
    .slice(0, 200)

  // traits：优势 + ["擅长" + 适合谁] + 表达习惯
  const strengths = interviewResult.strengthsWeaknesses.strengths.slice(0, 4)
  const suitable = interviewResult.targetAudience.suitable
    ? `擅长服务${interviewResult.targetAudience.suitable}`
    : ""
  const expressionTags = extractExpressionTags(interviewResult.expressionStyle)

  const mergedTraits = [
    ...(oldPersona?.traits ?? []),
    ...strengths,
    ...(suitable ? [suitable] : []),
    ...expressionTags,
  ]
  const traits = dedupeKeepOrder(mergedTraits).slice(0, 12)

  const style = [
    oldPersona?.style,
    interviewResult.expressionStyle,
  ].filter(Boolean).join("；").trim().slice(0, 500) || interviewResult.expressionStyle

  if (oldPersona?.bio && !bio.includes(oldPersona.bio.slice(0, 20))) {
    bio = `${oldPersona.bio} ${bio}`.slice(0, 200)
  }

  return { bio, traits, style }
}

/** 从表达习惯原文抽出关键词，用作 traits 的补充 */
function extractExpressionTags(raw: string): string[] {
  if (!raw) return []
  const keys = [
    ["口语化", "口语", "大白话", "接地气"],
    ["专业严谨", "严谨", "理性", "逻辑"],
    ["幽默风趣", "幽默", "段子", "调侃"],
    ["故事讲述", "讲故事", "案例驱动", "真实案例"],
    ["犀利直接", "直接", "犀利", "干脆"],
    ["干货密集", "干货", "信息密度高", "实用"],
    ["引用数据", "数据", "证据", "案例"],
  ]
  const tags: string[] = []
  for (const [label, ...words] of keys) {
    if (words.some((w) => raw.includes(w))) tags.push(label)
  }
  return tags
}

function dedupeKeepOrder<T>(xs: T[]): T[] {
  const seen = new Set<T>()
  const out: T[] = []
  for (const x of xs) {
    if (!seen.has(x) && String(x).trim().length > 0) {
      seen.add(x)
      out.push(x)
    }
  }
  return out
}
