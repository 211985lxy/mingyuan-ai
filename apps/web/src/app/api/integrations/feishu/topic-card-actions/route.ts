// ─── 飞书选题裁决卡回调路由 ─────────────────────────────────────
// 处理「采用 N / 换一批 / 都不行」按钮点击。
//
// 采用与控制台 topics/[id]/select 产出一致状态（status=selected + selectedIndex），
// 并额外记录人工裁决（reviewStatus / reviewedBy / reviewedVia / reviewNote）供回看与校准。
// 「换一批」生成要走 LLM，卡片回调必须秒回，故入队后台任务异步重生成后再推新卡。
//
// 鉴权：bot verification token（与 hitl-card-actions 同一机制）。
// api-inventory: auth=signed_integration

import { NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { resolveBotByVerificationToken } from "@/lib/feishu-agent-registry"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import {
  TOPIC_REVIEW_ACTIONS,
  planTopicReviewDecision,
  parseTopicReviewAction,
  type TopicReviewAction,
} from "@/lib/topic-review"
import { TOPIC_REGENERATE_TASK_KIND } from "@/features/topics/services/topic-regenerate-background-task"

export const dynamic = "force-dynamic"

interface TopicCardActionValue {
  topic_action?: string
  topic_selection_id?: string
  topic_index?: number
}

interface TopicCardCallbackBody {
  open_id?: string
  user_id?: string
  token?: string
  type?: string
  challenge?: string
  action?: {
    value?: TopicCardActionValue
    tag?: string
  }
}

function toast(content: string, type: "success" | "error" = "success") {
  return NextResponse.json({ toast: { type, content } }, { status: 200 })
}

/** 「换一批」的幂等键按分钟取整：挡住双击造成的重复生成，同时允许稍后再换。 */
function regenerateIdempotencyKey(selectionId: string) {
  return `topic-regenerate-${selectionId}-${Math.floor(Date.now() / 60_000)}`
}

function resolveReviewerId(body: TopicCardCallbackBody): string {
  return (
    (typeof body.open_id === "string" && body.open_id.trim()) ||
    (typeof body.user_id === "string" && body.user_id.trim()) ||
    ""
  )
}

type SettleOutcome = { ok: true; selectedIndex?: number } | { ok: false; message: string }

/** 计划并落库一次人工裁决；采用路径带 pending 原子保护，避免与控制台并发重复采用。 */
async function settleTopicReview(input: {
  selectionId: string
  action: TopicReviewAction
  rawIndex: unknown
  reviewerId: string
}): Promise<SettleOutcome> {
  const selection = await prisma.topicSelection.findUnique({
    where: { id: input.selectionId },
    select: { candidates: true },
  })
  if (!selection) return { ok: false, message: "该批选题已不存在" }

  const candidateCount = Array.isArray(selection.candidates)
    ? (selection.candidates as unknown[]).length
    : 0
  const plan = planTopicReviewDecision({
    action: input.action,
    candidateCount,
    rawIndex: input.rawIndex,
    reviewedBy: input.reviewerId,
    reviewedVia: "feishu",
  })
  if (!plan.ok) return { ok: false, message: plan.error }

  try {
    await prisma.topicSelection.update({
      where: plan.atomicOnPendingStatus
        ? { id: input.selectionId, status: "pending" }
        : { id: input.selectionId },
      data: plan.patch,
    })
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return { ok: false, message: "这一批已被处理过（可能已在控制台采用）" }
    }
    console.error("[feishu-topic-card-actions] 决策落库失败:", error instanceof Error ? error.message : error)
    return { ok: false, message: "决策落库失败，请稍后重试" }
  }
  return { ok: true, selectedIndex: plan.patch.selectedIndex }
}

export async function POST(request: Request) {
  let body: TopicCardCallbackBody | null
  try {
    // 飞书卡片回调 body 结构动态（action.value 自由键），不能用严格 zod 收口
    body = (await parseJsonRecord(request)) as unknown as TopicCardCallbackBody | null
  } catch {
    return toast("请求体不可解析", "error")
  }
  if (!body) return toast("请求体不可解析", "error")

  // 飞书卡片回调的 URL 校验挑战原样返回
  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }
  if (!resolveBotByVerificationToken(typeof body.token === "string" ? body.token : "")) {
    return NextResponse.json({ error: "Unknown agent bot" }, { status: 404 })
  }

  const actionValue = body.action?.value
  const action = parseTopicReviewAction(actionValue?.topic_action)
  const selectionId = actionValue?.topic_selection_id?.trim() || ""
  const reviewerId = resolveReviewerId(body)

  if (!selectionId) return toast("缺少选题批次 ID", "error")
  if (!action) return toast(`未知操作（仅支持 ${TOPIC_REVIEW_ACTIONS.join(" / ")}）`, "error")
  if (!reviewerId) return toast("缺少裁决人身份，拒绝匿名裁决", "error")

  const settled = await settleTopicReview({
    selectionId,
    action,
    rawIndex: actionValue?.topic_index,
    reviewerId,
  })
  if (!settled.ok) return toast(settled.message, "error")

  if (action === "regenerate") {
    try {
      await enqueueBackgroundTask(prisma, {
        kind: TOPIC_REGENERATE_TASK_KIND,
        aggregateType: "topic_selection",
        aggregateId: selectionId,
        idempotencyKey: regenerateIdempotencyKey(selectionId),
      })
    } catch (error) {
      console.error(
        "[feishu-topic-card-actions] 换一批入队失败:",
        error instanceof Error ? error.message : error,
      )
      return toast("已记录「换一批」，但重新生成入队失败，请稍后手动重试", "error")
    }
    return toast("已收到，正在重新生成，稍后推送新一批")
  }

  if (action === "reject") {
    return toast("已放进观察池，候选仍可在控制台查看")
  }
  return toast(`已采用第 ${(settled.selectedIndex ?? 0) + 1} 张，可进入写文案`)
}
