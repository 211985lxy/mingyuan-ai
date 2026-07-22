import { createHash, randomUUID } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { areBackgroundTasksEnabled } from "@/lib/background-task-runtime"
import { env } from "@/env"
import { extractFirstPublicUrl, extractVideoUrlFromText } from "@/lib/video-text-extractor"
import { resolveCanonicalSourceKey } from "@/lib/video-canonical-key"
import { allowChannelMessage } from "@/lib/channel-rate-limiter"
import { InspirationPipelineError } from "@/lib/inspiration-pipeline-error"
import { recordChannelMetric } from "@/lib/channel-metrics"
import { isReplySuppressed, isExecutionMode, resolveExecutionMode, type ExecutionMode } from "@/lib/execution-mode"
import { evaluateIngressPolicy } from "@/lib/ingress-policy"
import { enqueueReply as enqueueReplyOutbox, type EnqueueReplyInput } from "@/features/topics/services/reply-outbox"
import type { inspirationEventBodySchema } from "@/features/knowledge/contracts/api"
import type { z } from "zod"

export const INSPIRATION_PIPELINE_TASK_KIND = "inspiration_pipeline"
// INSPIRATION_REPLY_TASK_KIND removed in V2 — replies now go through ChannelReplyOutbox
export const INSPIRATION_EVENT_SOURCES = new Set(["feishu", "workbuddy_wechat", "wecom", "webhook"])

export type InspirationEventInput = z.infer<typeof inspirationEventBodySchema>

export type InspirationEventResult = {
  id: string
  duplicate: boolean
  status: string
  processingStage: string | null
  statusUrl: string
  shadowMode: boolean
}

function sourceToStoredSource(platform: InspirationEventInput["platform"]) {
  return platform
}

function normalizeContent(content: string) {
  return content.replace(/\s+/g, " ").trim()
}

export function isExplicitInspirationCaptureMessage(content: string, triggerKeywords: unknown) {
  if (!extractFirstPublicUrl(content)) return false
  const keywords = Array.isArray(triggerKeywords)
    ? triggerKeywords.filter((value): value is string => typeof value === "string")
    : ["收选题"]
  return keywords.some((keyword) => keyword.trim() && content.includes(keyword.trim()))
}

/**
 * @description 判断是否inspirationplatformenabled
 * @param platform - 平台
 * @returns 无返回值
 */
export function isInspirationPlatformEnabled(platform: InspirationEventInput["platform"]) {
  if (platform === "feishu") return env.FEISHU_TOPIC_PIPELINE_ENABLED !== "false"
  if (platform === "workbuddy_wechat") return env.WORKBUDDY_WECHAT_ENABLED === "true"
  if (platform === "wecom") return env.WECOM_INSPIRATION_ENABLED === "true"
  return true
}

/**
 * Legacy shadow mode check — backward compatible wrapper.
 * Maps INSPIRATION_PIPELINE_SHADOW_MODE=true to capture_only.
 * @deprecated Use resolveExecutionMode() directly instead.
 */
/**
 * @description 判断是否inspirationshadowmode
 * @returns 无返回值
 */
export function isInspirationShadowMode() {
  return env.INSPIRATION_PIPELINE_SHADOW_MODE === "true"
}

/**
 * Resolve the global execution mode override from environment.
 * Supports both the new INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE
 * and the legacy INSPIRATION_PIPELINE_SHADOW_MODE.
 */
function getGlobalExecutionModeOverride(): string | undefined {
  // New override takes precedence
  if (env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE) {
    return env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE
  }
  // Legacy shadow mode maps to capture_only
  if (env.INSPIRATION_PIPELINE_SHADOW_MODE === "true") {
    return "capture_only"
  }
  return undefined
}

/**
 * @description 构建inspirationdedupekey
 * @param input - 输入数据
 * @returns 无返回值
 */
export function buildInspirationDedupeKey(input: Pick<InspirationEventInput, "platform" | "externalAccountId" | "externalMessageId" | "externalChatId" | "externalSenderId" | "content" | "occurredAt">) {
  const accountPrefix = input.externalAccountId ? `${input.externalAccountId}:` : ""
  if (input.externalMessageId) return `${input.platform}:${accountPrefix}${input.externalMessageId}`
  const timestamp = input.occurredAt ? Date.parse(input.occurredAt) : Date.now()
  const bucket = Math.floor(timestamp / (5 * 60 * 1000))
  return createHash("sha256")
    .update([input.platform, input.externalAccountId || "", input.externalChatId, input.externalSenderId || "", normalizeContent(input.content), bucket].join("\n"))
    .digest("hex")
}

async function assertActiveProject(userId: string, projectId: string) {
  const project = await prisma.clientProject.findFirst({
    where: { id: projectId, userId, status: "active" },
    select: { id: true },
  })
  if (!project) throw new Error("INSPIRATION_PROJECT_FORBIDDEN")
}

async function assertChannelBinding(input: InspirationEventInput, userId: string) {
  const binding = await prisma.channelBinding.findUnique({
    where: {
      platform_externalAccountId_externalChatId: {
        platform: input.platform,
        externalAccountId: input.externalAccountId || "",
        externalChatId: input.externalChatId,
      },
    },
    select: { userId: true, projectId: true, status: true, triggerMode: true, triggerKeywords: true, executionMode: true },
  })

  if (!binding) {
    if (input.platform === "feishu" && env.FEISHU_TOPIC_CHAT_ID === input.externalChatId && env.FEISHU_TOPIC_CHAT_USER_ID === userId && env.FEISHU_TOPIC_CHAT_PROJECT_ID === input.projectId) {
      return true
    }
    if (input.platform === "webhook" && env.INSPIRATION_WEBHOOK_USER_ID === userId && env.INSPIRATION_WEBHOOK_PROJECT_ID === input.projectId) {
      return true
    }
    throw new Error("INSPIRATION_CHANNEL_UNBOUND")
  }
  if (binding.status !== "active" || binding.userId !== userId || binding.projectId !== input.projectId) {
    throw new Error("INSPIRATION_CHANNEL_FORBIDDEN")
  }

  // Evaluate trigger policy via IngressPolicy pure function
  const keywords = Array.isArray(binding.triggerKeywords)
    ? binding.triggerKeywords.filter((value): value is string => typeof value === "string")
    : ["收选题"]
  const policy = evaluateIngressPolicy({
    triggerMode: binding.triggerMode as "all" | "mention_or_keyword",
    triggerKeywords: keywords,
    conversationType: input.conversationType,
    messageType: input.messageType,
    mentionsBot: input.mentionsBot,
    content: input.content,
  })
  if (!policy.allowed) throw new Error(`INSPIRATION_${policy.reason}`)
  return true
}

/**
 * @description 解析channelbinding
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function resolveChannelBinding(input: { platform: string; externalChatId: string; externalAccountId?: string }) {
  const binding = await prisma.channelBinding.findUnique({
    where: {
      platform_externalAccountId_externalChatId: {
        platform: input.platform,
        externalAccountId: input.externalAccountId || "",
        externalChatId: input.externalChatId,
      },
    },
    select: { userId: true, projectId: true, status: true, executionMode: true, externalAccountId: true, triggerMode: true, triggerKeywords: true, routeTarget: true, defaultAgentId: true },
  })
  if (binding?.status === "active") return binding
  if (input.platform === "feishu" && env.FEISHU_TOPIC_CHAT_ID === input.externalChatId && env.FEISHU_TOPIC_CHAT_USER_ID && env.FEISHU_TOPIC_CHAT_PROJECT_ID) {
    return { userId: env.FEISHU_TOPIC_CHAT_USER_ID, projectId: env.FEISHU_TOPIC_CHAT_PROJECT_ID, status: "active" as const, executionMode: "live" as const, externalAccountId: "" as const, triggerMode: "mention_or_keyword" as const, triggerKeywords: ["收选题"], routeTarget: "topic" as const, defaultAgentId: null }
  }
  return null
}

/**
 * Resolve the execution mode for a channel binding, considering the global override.
 * Falls back to "live" when binding data is unavailable (e.g., env-based bindings).
 */
/**
 * @description 解析bindingexecutionmode
 * @param bindingMode? - bindingMode?
 * @returns ExecutionMode
 */
export function resolveBindingExecutionMode(bindingMode?: string | null): ExecutionMode {
  const mode = isExecutionMode(bindingMode) ? bindingMode : "live"
  return resolveExecutionMode(mode, getGlobalExecutionModeOverride())
}

/**
 * @description ingestinspirationevent
 * @param input - 输入数据
 * @param userId - 用户 ID
 * @param options? - 可选参数
 * @returns Promise<InspirationEventResult>
 */
export async function ingestInspirationEvent(
  input: InspirationEventInput,
  userId: string,
  options?: {
    /** When provided, an "accepted" reply is enqueued in the same transaction as the Inspiration create. */
    acceptedReplyContext?: Pick<EnqueueReplyInput, "externalChatId" | "externalMessageId" | "replyText">
  },
): Promise<InspirationEventResult> {
  if (!areBackgroundTasksEnabled()) throw new Error("BACKGROUND_TASKS_UNAVAILABLE")
  if (env.INSPIRATION_PIPELINE_ENABLED === "false") throw new Error("INSPIRATION_PIPELINE_DISABLED")
  if (!INSPIRATION_EVENT_SOURCES.has(input.platform)) throw new Error("INSPIRATION_PLATFORM_UNSUPPORTED")
  if (!isInspirationPlatformEnabled(input.platform)) throw new Error("INSPIRATION_PLATFORM_DISABLED")

  await assertActiveProject(userId, input.projectId)
  await assertChannelBinding(input, userId)

  // Rate limiting: reject if channel is sending too many messages
  const rateLimit = await allowChannelMessage({
    platform: input.platform,
    externalChatId: input.externalChatId,
    externalAccountId: input.externalAccountId,
  })
  if (!rateLimit.allowed) {
    recordChannelMetric({ metric: "rate_limited", platform: input.platform, externalChatId: input.externalChatId, externalAccountId: input.externalAccountId }).catch(() => {})
    throw new InspirationPipelineError("RATE_LIMITED")
  }

  // Multi-URL rejection: only one video URL per message
  const sourceUrl = extractVideoUrlFromText(input.content)
  if (sourceUrl) {
    const allUrls = input.content.match(/[a-z][a-z\d+.-]*:\/\/[^\s，。；、"'<>]+/gi)
    if (allUrls && allUrls.length > 1) {
      throw new InspirationPipelineError("MULTIPLE_VIDEO_URLS")
    }
  }

  // Resolve execution mode from the channel binding
  let executionMode: ExecutionMode
  try {
    const binding = await prisma.channelBinding.findUnique({
      where: {
        platform_externalAccountId_externalChatId: {
          platform: input.platform,
          externalAccountId: input.externalAccountId || "",
          externalChatId: input.externalChatId,
        },
      },
      select: { executionMode: true },
    })
    executionMode = resolveBindingExecutionMode(binding?.executionMode)
  } catch {
    executionMode = resolveBindingExecutionMode(null)
  }

  const dedupeKey = buildInspirationDedupeKey(input)

  // Content-level dedup: check canonicalSourceKey across the user's project
  let canonicalSourceKey: string | null = null
  if (sourceUrl) {
    canonicalSourceKey = resolveCanonicalSourceKey(sourceUrl)
    if (canonicalSourceKey) {
      const contentDup = await prisma.inspiration.findFirst({
        where: {
          userId,
          projectId: input.projectId,
          canonicalSourceKey,
        },
        select: { id: true, aiStatus: true, processingStage: true },
      })
      if (contentDup) {
        recordChannelMetric({ metric: "duplicate", platform: input.platform, externalChatId: input.externalChatId, externalAccountId: input.externalAccountId }).catch(() => {})
        return {
          id: contentDup.id,
          duplicate: true,
          status: contentDup.processingStage || contentDup.aiStatus,
          processingStage: contentDup.processingStage,
          statusUrl: `/api/agent/v1/inspiration/events/${contentDup.id}`,
          shadowMode: isReplySuppressed(executionMode),
        }
      }
    }
  }

  const existing = await prisma.inspiration.findUnique({ where: { dedupeKey }, select: { id: true, aiStatus: true, processingStage: true } })
  if (existing) {
    recordChannelMetric({ metric: "duplicate", platform: input.platform, externalChatId: input.externalChatId, externalAccountId: input.externalAccountId }).catch(() => {})
    return {
      id: existing.id,
      duplicate: true,
      status: existing.processingStage || existing.aiStatus,
      processingStage: existing.processingStage,
      statusUrl: `/api/agent/v1/inspiration/events/${existing.id}`,
      shadowMode: isReplySuppressed(executionMode),
    }
  }

  const proposedId = randomUUID()
  const replySuppressed = isReplySuppressed(executionMode)
  const shouldEnqueueAcceptedReply = !replySuppressed && !!options?.acceptedReplyContext
  const inspiration = await prisma.$transaction(async (tx) => {
    const record = await tx.inspiration.upsert({
      where: { dedupeKey },
      create: {
        id: proposedId,
        userId,
        projectId: input.projectId,
        source: sourceToStoredSource(input.platform),
        content: input.content,
        aiStatus: "pending",
        processingStage: "queued",
        externalMessageId: input.externalMessageId,
        externalChatId: input.externalChatId,
        externalAccountId: input.externalAccountId,
        externalSenderId: input.externalSenderId,
        externalOccurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
        dedupeKey,
        sourceUrl,
        canonicalSourceKey,
        executionModeSnapshot: executionMode,
        replyStatus: replySuppressed ? "suppressed" : "pending",
      },
      update: {},
      select: { id: true, aiStatus: true, processingStage: true },
    })
    await enqueueBackgroundTask(tx as never, {
      kind: INSPIRATION_PIPELINE_TASK_KIND,
      aggregateType: "inspiration",
      aggregateId: record.id,
      idempotencyKey: `inspiration-pipeline:${record.id}`,
      maxAttempts: 12,
    })
    // Enqueue accepted reply inside the same transaction for atomicity
    if (record.id === proposedId && shouldEnqueueAcceptedReply && options?.acceptedReplyContext) {
      await enqueueReplyOutbox(
        {
          inspirationId: record.id,
          replyType: "accepted",
          platform: input.platform,
          externalAccountId: input.externalAccountId,
          ...options.acceptedReplyContext,
        },
        tx as never,
      )
    }
    return record
  })

  // Record metrics fire-and-forget (don't block the critical path)
  recordChannelMetric({ metric: "received", platform: input.platform, externalChatId: input.externalChatId, externalAccountId: input.externalAccountId }).catch(() => {})
  recordChannelMetric({ metric: "pipeline_started", platform: input.platform, externalChatId: input.externalChatId, externalAccountId: input.externalAccountId }).catch(() => {})

  return {
    id: inspiration.id,
    duplicate: inspiration.id !== proposedId,
    status: inspiration.id === proposedId ? "queued" : inspiration.processingStage || inspiration.aiStatus,
    processingStage: inspiration.id === proposedId ? "queued" : inspiration.processingStage,
    statusUrl: `/api/agent/v1/inspiration/events/${inspiration.id}`,
    shadowMode: replySuppressed,
  }
}

/**
 * @description serializeinspirationevent
 * @param record - 记录
 * @returns 无返回值
 */
export function serializeInspirationEvent(record: {
  id: string
  aiStatus: string
  processingStage: string | null
  source: string
  sourceUrl: string | null
  generatedTopics: Prisma.JsonValue | null
  knowledgeEntryId: string | null
  topicSelectionId: string | null
  errorMessage: string | null
  replyErrorMessage: string | null
  replyStatus: string | null
  executionModeSnapshot: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: record.id,
    status: record.processingStage || record.aiStatus,
    processingStage: record.processingStage,
    source: record.source,
    sourceUrl: record.sourceUrl,
    generatedTopics: record.generatedTopics,
    knowledgeEntryId: record.knowledgeEntryId,
    topicSelectionId: record.topicSelectionId,
    errorMessage: record.errorMessage,
    replyErrorMessage: record.replyErrorMessage,
    replyStatus: record.replyStatus,
    executionMode: record.executionModeSnapshot,
    shadowMode: isReplySuppressed(record.executionModeSnapshot as ExecutionMode | null),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    statusUrl: `/api/agent/v1/inspiration/events/${record.id}`,
  }
}
