/**
 * 选题人工判断的纯逻辑层（不含 IO，便于单测）。
 *
 * 设计取舍：选题是「定生死」的决策，AI 只做提案与评分，采用 / 换一批 / 都不行由人裁决。
 * 本模块只把人的一次点击翻译成一条可落库的决策补丁；「都不行」落到观察池
 * （reviewStatus=archived，候选正文仍留在 candidates 里供日后回看），不删除任何候选。
 */

import { DEGRADED_TOPIC_SELECT_MESSAGE } from "@/lib/topic-degradation"

export const TOPIC_REVIEW_ACTIONS = ["adopt", "regenerate", "reject"] as const
export type TopicReviewAction = (typeof TOPIC_REVIEW_ACTIONS)[number]

export const TOPIC_REVIEW_STATUS = {
  /** 已生成/已推送，等待人工裁决 */
  pending: "pending",
  /** 人工采用了某一张 */
  adopted: "adopted",
  /** 人工要求换一批（旧候选保留，等待新一批推送） */
  regenerated: "regenerated",
  /** 人工判断都不行，进入观察池 */
  archived: "archived",
} as const

export const TOPIC_REVIEW_STATUS_LABEL: Record<string, string> = {
  [TOPIC_REVIEW_STATUS.pending]: "待裁决",
  [TOPIC_REVIEW_STATUS.adopted]: "已采用",
  [TOPIC_REVIEW_STATUS.regenerated]: "已要求换一批",
  [TOPIC_REVIEW_STATUS.archived]: "都不行（观察池）",
}

export interface TopicReviewPatch {
  /** 既有生命周期：采用时与 `topics/[id]/select` 控制台路径保持一致置为 selected */
  status?: string
  reviewStatus: string
  /** 采用时才写入；0 基下标，与 candidates 数组对齐 */
  selectedIndex?: number
  reviewedAt: Date
  reviewedBy: string
  reviewedVia: string
  reviewNote?: string
}

export type TopicReviewPlan =
  | {
      ok: true
      patch: TopicReviewPatch
      /** 采用是幂等的：只在记录仍为 pending 时生效，避免并发重复采用 */
      atomicOnPendingStatus: boolean
    }
  | { ok: false; error: string }

/**
 * @description 解析飞书卡片回调传来的动作
 * @param value - 卡片 value 中的 topic_action 原始值
 * @returns 合法动作，否则 null
 */
export function parseTopicReviewAction(value: unknown): TopicReviewAction | null {
  return typeof value === "string" && (TOPIC_REVIEW_ACTIONS as readonly string[]).includes(value)
    ? (value as TopicReviewAction)
    : null
}

/**
 * @description 把一次人工裁决翻译成落库补丁
 * @param input - 动作、候选数量、候选序号（采用时必填）、决策人、决策来源、备注
 * @returns 合法则返回补丁；序号越界等非法输入返回可读错误
 */
export function planTopicReviewDecision(input: {
  action: TopicReviewAction
  candidateCount: number
  rawIndex?: unknown
  reviewedBy: string
  reviewedVia: string
  note?: string
  now?: Date
  /** 降级模板批次不得被采用，换一批 / 都不行仍允许 */
  degraded?: boolean
}): TopicReviewPlan {
  const note = input.note?.trim()
  const base = {
    reviewedAt: input.now ?? new Date(),
    reviewedBy: input.reviewedBy,
    reviewedVia: input.reviewedVia,
    ...(note ? { reviewNote: note } : {}),
  }

  if (input.action === "adopt" && input.degraded) {
    return { ok: false, error: DEGRADED_TOPIC_SELECT_MESSAGE }
  }

  if (input.action === "regenerate") {
    return {
      ok: true,
      atomicOnPendingStatus: false,
      patch: { ...base, reviewStatus: TOPIC_REVIEW_STATUS.regenerated },
    }
  }
  if (input.action === "reject") {
    return {
      ok: true,
      atomicOnPendingStatus: false,
      patch: { ...base, reviewStatus: TOPIC_REVIEW_STATUS.archived },
    }
  }

  const index = typeof input.rawIndex === "number"
    ? input.rawIndex
    : Number.parseInt(String(input.rawIndex ?? ""), 10)
  if (!Number.isInteger(index) || index < 0 || index >= input.candidateCount) {
    return {
      ok: false,
      error: `候选序号无效：${String(input.rawIndex)}（本批共 ${input.candidateCount} 张）`,
    }
  }
  return {
    ok: true,
    atomicOnPendingStatus: true,
    patch: {
      ...base,
      status: "selected",
      selectedIndex: index,
      reviewStatus: TOPIC_REVIEW_STATUS.adopted,
    },
  }
}
