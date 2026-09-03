/**
 * 采访意图路由 — 从 aim-turn-intent.ts 拆出以遵守模块 ≤ 500 行约束。
 *
 * 包含：transcript 标志路由 + 触发词路由。
 * `resolveAimTurnIntent` 先调用 `tryResolveInterviewIntent`，非 null 则直接返回。
 */

import type { AimTurnIntent } from "@/lib/aim-turn-intent-types"

export interface InterviewTranscriptFlags {
  /** transcribe route 返回的 readyForInterviewSkill 标志 —— 逐字稿已准备好进入老板说明书采访技能 */
  readyForInterviewSkill?: boolean
  /** 转写模式：interview = 采访语音逐字稿 */
  mode?: "interview" | string
}

/** 采访/画像建档触发词：命中即直接锁定 action+scope */
const INTERVIEW_TRIGGER_WORDS = [
  "采访", "开始采访", "老板说明书", "画像采集", "画像建档", "帮我做老板说明书", "profile interview",
] as const

/**
 * 尝试采访路由：
 * - 最高优先级：transcript 标志（readyForInterviewSkill / mode=interview）→ 强制路由
 * - 次优先级：触发词命中 → 锁定 interview_build_profile + ip_profile
 * - 未命中 → 返回 null（调用方继续走常规意图判断）
 */
export function tryResolveInterviewIntent(input: {
  text: string
  transcript?: InterviewTranscriptFlags
  readyForInterviewSkill?: boolean
}): AimTurnIntent | null {
  // 【最高优先级 · 比触发词更高】readyForInterviewSkill === true 来自 transcribe route
  const isInterviewRouted =
    input.readyForInterviewSkill === true ||
    input.transcript?.readyForInterviewSkill === true ||
    input.transcript?.mode === "interview"
  if (isInterviewRouted) {
    return {
      summary:
        "本轮意图：老板说明书采访建档（由采访逐字稿触发）——解析六维画像摘要，等待用户回复「确认应用」后写入老板说明书。",
      action: "interview_build_profile",
      scope: "ip_profile",
      deliverable: "IP 画像采访结构化 JSON",
      keep: [
        "六维覆盖：经历、业务、擅长边界、服务人群、表达习惯、内容边界",
        "采访逐字稿原始信息保留，用于回溯源",
      ],
      avoid: ["编造事实", "中途输出正式文案", "输出营销文案/选题/口播稿"],
      archiveGaps: [],
    }
  }

  // 【最高优先级】采访/画像建档触发词：命中即直接锁定 action+scope
  const isInterviewRequest = INTERVIEW_TRIGGER_WORDS.some((w) => input.text.includes(w))
  if (isInterviewRequest) {
    return {
      summary: "本轮意图：老板说明书采访建档——通过结构化 30 分钟六维问答采集 IP 画像信息，最终输出 JSON 摘要。",
      action: "interview_build_profile",
      scope: "ip_profile",
      deliverable: "IP 画像采访结构化 JSON",
      keep: ["六维覆盖：经历、业务、擅长边界、服务人群、表达习惯、内容边界"],
      avoid: ["编造事实", "中途输出正式文档", "输出营销文案/选题/口播稿"],
      archiveGaps: [],
    }
  }

  return null
}
