/**
 * WP-8 无人值守执行入口（90 天计划 6.1）。
 *
 * 把「扫描待处理经营事项 → 推进会议洞察工作流」的无人值守链路接到真实飞书表：
 *   GET /api/cron/feishu-work-items/dispatch
 *   由定时任务或受保护 Webhook 触发，单实例或受执行租约保护下并发安全。
 *
 * 鉴权：Authorization: Bearer <CRON_SECRET>（复用 validateCronSecret，与现有
 *   cron 路由一致）。CRON_SECRET 未配置 → fail-closed 拒绝。
 *
 * 边界（对齐计划 6.1 与零 Mock 铁律）：
 * - 飞书/经营事项配置缺失 → 503，不伪造默认表。
 * - 单一动作只推进内部状态（待处理 → 处理中 → 待人工审核），绝不自动向客户
 *   发送、报价、发布或删除。
 * - 会议字段契约集中于 lib/aim-feishu-work-item.ts 的 MEETING_WORK_ITEM_FIELDS，
 *   上线前须与飞书生产表逐字核对（会议标题 / 客户名称 两字段尤其需确认）。
 */
import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import {
  createLarkWorkItemStore,
  createShadowWorkItemStore,
  listPendingWorkItemRecords,
  readWorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import { parseFeishuWorkItem } from "@/lib/aim-feishu-work-item"
import {
  createAimGenerationInsightResultSink,
} from "@/lib/aim/meeting-insight-result-sink"
import {
  claimAimTrace,
  failAimTrace,
  releaseAimTraceClaim,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import {
  dispatchPendingWorkItems,
  type WorkItemDispatchSummary,
  type WorkItemDispatcherPorts,
} from "@/lib/aim/services/work-item-dispatcher"
import {
  readSupervisorNotificationConfig,
  sendFeishuSupervisorNotification,
} from "@/lib/aim/feishu-supervisor-notifier"
import { executeMeetingWorkItem } from "@/lib/aim/services/meeting-work-item-executor"
import { readLoopRuntimeConfig } from "@/lib/aim/loop-runtime-config"
import { prisma } from "@/lib/prisma"
import { env } from "@/env"

export const runtime = "nodejs"
/** 最坏情况：10 条 × 单次执行租约 5 分钟，留足余量。 */
export const maxDuration = 300

function unconfigured(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 503 })
}

function publicDispatchSummary(summary: WorkItemDispatchSummary) {
  return {
    ...summary,
    errors: summary.errors.map(({ recordId }) => ({
      recordId,
      code: "DISPATCH_ITEM_FAILED",
    })),
  }
}

function requireClaimedTrace(token: unknown): AimTraceRecorder {
  if (!token || typeof token !== "object") throw new Error("调度 claim 未返回 Trace。")
  const trace = token as Partial<AimTraceRecorder>
  if (typeof trace.id !== "string" || typeof trace.startedAt !== "number") {
    throw new Error("调度 claim 返回的 Trace 无效。")
  }
  return trace as AimTraceRecorder
}

export async function GET(request: NextRequest) {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let runtimeConfig
  try {
    runtimeConfig = readLoopRuntimeConfig()
  } catch {
    return unconfigured("Business Loop 灰度配置不可用，请检查服务端配置。")
  }
  if (!runtimeConfig.enabled) {
    return NextResponse.json({ ok: true, enabled: false, mode: "disabled" })
  }

  let config
  try {
    config = readWorkItemStoreConfig()
  } catch {
    return unconfigured("飞书经营事项配置不可用，请检查服务端配置。")
  }

  const ownerUserId = env.AIM_WORK_ITEM_OWNER_USER_ID?.trim()
  if (!ownerUserId) {
    return unconfigured("会议洞察无人值守缺少 AIM_WORK_ITEM_OWNER_USER_ID 配置，fail-closed。")
  }

  let notificationConfig: ReturnType<typeof readSupervisorNotificationConfig>
  try {
    notificationConfig = runtimeConfig.shadowMode
      ? { enabled: false }
      : readSupervisorNotificationConfig()
  } catch {
    return unconfigured("飞书监督通知配置不可用，请检查服务端配置。")
  }

  const realStore = createLarkWorkItemStore(config)
  const store = runtimeConfig.shadowMode
    ? createShadowWorkItemStore(realStore)
    : realStore
  const resultSink = createAimGenerationInsightResultSink({ ownerUserId })

  const ports: WorkItemDispatcherPorts = {
    store,
    listPending: async (limit) => {
      const records = await listPendingWorkItemRecords(config, 100)
      return records
        .filter((record) => runtimeConfig.pilotProjectIds.has(parseFeishuWorkItem(record.fields).aimProjectId))
        .slice(0, limit)
    },
    claim: async (_recordId, context) => {
      const claimed = await claimAimTrace({
        id: context.runId,
        userId: ownerUserId,
        projectId: context.projectId || undefined,
        agentId: context.loopId === "sales-diagnosis-v1" ? "business_diagnosis" : undefined,
        action: "generate",
        inputSummary: `${context.loopId || "invalid-loop"}:${context.idempotencyKey}`,
      })
      return claimed.acquired
        ? { acquired: true, token: claimed.trace }
        : { acquired: false }
    },
    failClaim: async (token, error) => {
      if (token) await failAimTrace(requireClaimedTrace(token), error)
    },
    releaseClaim: async (token) => {
      if (token) await releaseAimTraceClaim(requireClaimedTrace(token))
    },
    execute: (recordId, context) => executeMeetingWorkItem({
      store,
      resultSink,
      ownerUserId,
      recordId,
      context,
      findProjectOwner: async (projectId) => {
        const project = await prisma.clientProject.findUnique({
          where: { id: projectId },
          select: { userId: true },
        })
        return project?.userId ?? null
      },
    }),
    notify: runtimeConfig.shadowMode
      ? async () => undefined
      : (notification) => sendFeishuSupervisorNotification({
          config: notificationConfig,
          notification,
        }),
    now: () => new Date(),
    holderId: process.env.HOSTNAME?.trim() || "cron-unattended",
  }

  let summary
  try {
    summary = await dispatchPendingWorkItems(ports, 10)
  } catch {
    // 飞书读写 / 调度内部异常（如 listPending 抛错）必须转受控 503，
    // 绝不把未捕获异常暴露为 500，符合兄弟 cron 路由的 fail-closed 行为。
    return unconfigured("无人值守调度执行失败，请查看服务端日志。")
  }
  return NextResponse.json({
    ok: true,
    enabled: true,
    mode: runtimeConfig.shadowMode ? "shadow" : "live",
    summary: publicDispatchSummary(summary),
  })
}
