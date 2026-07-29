/**
 * 会后资产候选的落库与人工审核（90 天计划 3.1）。
 *
 * 两道人工闸门：
 * 1. 会议洞察必须人工审核通过（请求显式 approve，或 taskSpec 已有 humanReview 记录）
 *    才能生成候选；审核事实写回 AimGeneration.taskSpec.humanReview 供审计。
 * 2. 候选默认 reviewStatus=pending；只有人工 approve 后才可升级为正式知识
 *   （promote 写入 KnowledgeEntry，sourceType=meeting_insight），reject 不升级。
 *
 * 幂等：同一会议洞察重复生成时按 (kind, evidence) 去重，不重复创建。
 * 跨项目复用默认 false；人工批准后才允许 promote 到全局知识（projectId=null）。
 */
import { prisma } from "@/lib/prisma"
import {
  buildAssetCandidatesFromInsight,
  type AssetCandidateDraft,
} from "@/lib/aim/asset-candidates"
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import { MEETING_INSIGHT_TASK_SPEC_KIND } from "@/lib/aim/meeting-insight-result-sink"

export interface AssetCandidateRecord {
  id: string
  userId: string
  projectId: string
  generationId: string
  feishuRecordId: string | null
  kind: string
  title: string
  content: string
  evidence: string | null
  confidence: string
  reviewStatus: string
  crossProjectAllowed: boolean
  promotedEntryId: string | null
  promotedAt?: Date | null
  customerOutcomeProjectionId?: string | null
}

interface GenerationSnapshot {
  id: string
  userId: string
  projectId: string | null
  workflowStatus: string
  taskSpec: unknown
}

/** prisma 的最小投影（便于注入测试替身）。 */
export interface AssetCandidateStorePort {
  aimGeneration: {
    findFirst(args: { where: { id: string; userId: string } }): Promise<GenerationSnapshot | null>
    update(args: {
      where: { id: string }
      data: { taskSpec: Record<string, unknown> }
    }): Promise<unknown>
  }
  assetCandidate: {
    findMany(args: {
      where: Record<string, unknown>
      orderBy?: unknown
      take?: number
    }): Promise<AssetCandidateRecord[]>
    findFirst(args: { where: { id: string; userId: string } }): Promise<AssetCandidateRecord | null>
    create(args: { data: Record<string, unknown> }): Promise<AssetCandidateRecord>
    update(args: {
      where: { id: string }
      data: Record<string, unknown>
    }): Promise<AssetCandidateRecord>
  }
  knowledgeEntry: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>
    update(args: {
      where: { id: string }
      data: Record<string, unknown>
    }): Promise<{ id: string }>
  }
}

let defaultStore: AssetCandidateStorePort | null = null

/**
 * @description 获取默认assetcandidatestore
 * @returns AssetCandidateStorePort
 */
export function getDefaultAssetCandidateStore(): AssetCandidateStorePort {
  if (!defaultStore) defaultStore = prisma as unknown as AssetCandidateStorePort
  return defaultStore
}

export type GenerateAssetCandidatesResult =
  | { ok: true; created: number; skipped: number; candidates: AssetCandidateRecord[] }
  | { ok: false; status: number; error: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** 校验 taskSpec.insight 的最小结构，损坏时拒绝而不是伪造。 */
function parseStoredInsight(value: unknown): MeetingInsight | null {
  if (!isRecord(value)) return null
  const arrayFields = [
    "pains",
    "goals",
    "objections",
    "followUps",
    "diagnosisQuestions",
    "topicCandidates",
    "deliveryTasks",
  ] as const
  for (const field of arrayFields) {
    if (!Array.isArray(value[field])) return null
  }
  return value as unknown as MeetingInsight
}

/**
 * 从已人工审核的会议洞察生成资产候选。
 * - approve=true 表示本次请求即人工审核动作，写回 taskSpec.humanReview。
 * - 已有 humanReview 记录时无需重复 approve。
 */
/**
 * @description 生成meetingassetcandidates
 * @param input - 输入数据
 * @returns Promise<GenerateAssetCandidatesResult>
 */
export async function generateMeetingAssetCandidates(input: {
  userId: string
  generationId: string
  approve?: boolean
  store?: AssetCandidateStorePort
  now?: () => Date
}): Promise<GenerateAssetCandidatesResult> {
  const store = input.store ?? getDefaultAssetCandidateStore()
  const generation = await store.aimGeneration.findFirst({
    where: { id: input.generationId, userId: input.userId },
  })
  if (!generation) return { ok: false, status: 404, error: "not found" }

  const taskSpec = isRecord(generation.taskSpec) ? { ...generation.taskSpec } : null
  if (!taskSpec || taskSpec.kind !== MEETING_INSIGHT_TASK_SPEC_KIND) {
    return { ok: false, status: 409, error: "该记录不是会议洞察，无法生成会后资产候选。" }
  }

  const existingReview = isRecord(taskSpec.humanReview) ? taskSpec.humanReview : null
  if (!existingReview?.approvedAt) {
    if (input.approve !== true) {
      return {
        ok: false,
        status: 409,
        error: "会议洞察尚未人工审核通过：请先审核（approve=true），再生成资产候选。",
      }
    }
    const now = (input.now?.() ?? new Date()).toISOString()
    taskSpec.humanReview = { approvedAt: now, approvedBy: input.userId }
    await store.aimGeneration.update({
      where: { id: generation.id },
      data: { taskSpec },
    })
  }

  const projectId = generation.projectId?.trim()
  if (!projectId) {
    return { ok: false, status: 409, error: "会议洞察缺少项目归属，禁止生成资产候选。" }
  }

  const insight = parseStoredInsight(taskSpec.insight)
  if (!insight) {
    return { ok: false, status: 409, error: "会议洞察数据缺失或损坏，无法生成资产候选。" }
  }

  const drafts = buildAssetCandidatesFromInsight(insight)
  const existing = await store.assetCandidate.findMany({
    where: { generationId: generation.id, userId: input.userId },
    take: 500,
  })
  const existingKeys = new Set(existing.map((row) => `${row.kind}\u0000${row.evidence ?? ""}`))

  const createdRows: AssetCandidateRecord[] = []
  let skipped = 0
  for (const draft of drafts) {
    const key = `${draft.kind}\u0000${draft.evidence ?? ""}`
    if (existingKeys.has(key)) {
      skipped += 1
      continue
    }
    existingKeys.add(key)
    createdRows.push(
      await store.assetCandidate.create({
        data: {
          userId: input.userId,
          projectId,
          generationId: generation.id,
          feishuRecordId:
            typeof taskSpec.workItemRecordId === "string" ? taskSpec.workItemRecordId : null,
          kind: draft.kind,
          title: draft.title,
          content: draft.content,
          evidence: draft.evidence,
          confidence: draft.confidence,
          reviewStatus: "pending",
          crossProjectAllowed: false,
        } satisfies Partial<AssetCandidateRecord> & AssetCandidateDraft,
      }),
    )
  }

  return { ok: true, created: createdRows.length, skipped, candidates: createdRows }
}

/** 资产类型 → 正式知识分类映射（升级时使用）。 */
const PROMOTE_CATEGORY: Record<string, string> = {
  pain_point: "customer_pain",
  customer_quote: "customer_qa",
  objection: "customer_qa",
  deal_trigger: "product_usp",
  follow_up_script: "customer_qa",
  content_topic: "customer_pain",
  case_candidate: "project_case",
  methodology_revision: "boss_experience",
}

export type ReviewAssetCandidateResult =
  | { ok: true; record: AssetCandidateRecord }
  | { ok: false; status: number; error: string }

/**
 * 人工审核资产候选。
 * - approve：批准；promote=true 时升级为正式知识（未升级过的已批准候选允许补升级）。
 * - reject：拒绝；已 approved 的候选不能拒绝，已 rejected 的候选不能批准。
 * - 重复同向操作幂等（no-op 返回当前记录）。
 */
async function syncKnowledgeProjectScope(input: {
  store: AssetCandidateStorePort
  promotedEntryId: string | null
  crossProjectAllowed: boolean
  projectId: string
}) {
  if (!input.promotedEntryId) return
  await input.store.knowledgeEntry.update({
    where: { id: input.promotedEntryId },
    data: { projectId: input.crossProjectAllowed ? null : input.projectId },
  })
}

async function promoteKnowledgeEntry(input: {
  store: AssetCandidateStorePort
  userId: string
  record: AssetCandidateRecord
  crossProjectAllowed: boolean
}) {
  const isCustomerOutcomeCase = Boolean(input.record.customerOutcomeProjectionId)
  return input.store.knowledgeEntry.create({
    data: {
      userId: input.userId,
      projectId: input.crossProjectAllowed ? null : input.record.projectId,
      category: PROMOTE_CATEGORY[input.record.kind] ?? "customer_qa",
      title: input.record.title.slice(0, 200),
      content: input.record.evidence
        ? `${input.record.content}\n\n原文证据：${input.record.evidence}`
        : input.record.content,
      tags: isCustomerOutcomeCase
        ? ["customer_outcome", input.record.kind, "confidence:confirmed"]
        : ["meeting_candidate", input.record.kind],
      sourceType: isCustomerOutcomeCase ? "customer_outcome" : "meeting_insight",
    },
  })
}

async function rejectAssetCandidate(
  store: AssetCandidateStorePort,
  record: AssetCandidateRecord,
): Promise<ReviewAssetCandidateResult> {
  if (record.reviewStatus === "approved") {
    return { ok: false, status: 409, error: "已批准的候选不能拒绝。" }
  }
  if (record.reviewStatus === "rejected") return { ok: true, record }
  return {
    ok: true,
    record: await store.assetCandidate.update({
      where: { id: record.id },
      data: { reviewStatus: "rejected" },
    }),
  }
}

async function approveAssetCandidate(input: {
  store: AssetCandidateStorePort
  userId: string
  record: AssetCandidateRecord
  promote?: boolean
  crossProjectAllowed?: boolean
}): Promise<ReviewAssetCandidateResult> {
  const { store, record } = input
  if (record.reviewStatus === "rejected") {
    return { ok: false, status: 409, error: "已拒绝的候选不能重新批准。" }
  }
  const crossProjectAllowed = input.crossProjectAllowed ?? record.crossProjectAllowed
  const needsPromotion = input.promote === true && !record.promotedEntryId
  const scopeChanged = crossProjectAllowed !== record.crossProjectAllowed

  if (record.reviewStatus === "approved" && !needsPromotion) {
    if (!scopeChanged) return { ok: true, record }
    await syncKnowledgeProjectScope({
      store,
      promotedEntryId: record.promotedEntryId,
      crossProjectAllowed,
      projectId: record.projectId,
    })
    return {
      ok: true,
      record: await store.assetCandidate.update({
        where: { id: record.id },
        data: { crossProjectAllowed },
      }),
    }
  }

  let promotedEntryId = record.promotedEntryId
  let promotedAt = record.promotedAt ?? null
  if (needsPromotion) {
    const entry = await promoteKnowledgeEntry({
      store, userId: input.userId, record, crossProjectAllowed,
    })
    promotedEntryId = entry.id
    promotedAt = new Date()
  } else if (scopeChanged) {
    await syncKnowledgeProjectScope({
      store,
      promotedEntryId: record.promotedEntryId,
      crossProjectAllowed,
      projectId: record.projectId,
    })
  }

  return {
    ok: true,
    record: await store.assetCandidate.update({
      where: { id: record.id },
      data: {
        reviewStatus: "approved",
        promotedEntryId,
        crossProjectAllowed,
        ...(promotedAt && !record.promotedAt ? { promotedAt } : {}),
      },
    }),
  }
}

/**
 * @description 审查assetcandidate
 */
export async function reviewAssetCandidate(input: {
  userId: string
  candidateId: string
  action: "approve" | "reject"
  promote?: boolean
  crossProjectAllowed?: boolean
  store?: AssetCandidateStorePort
}): Promise<ReviewAssetCandidateResult> {
  const store = input.store ?? getDefaultAssetCandidateStore()
  const record = await store.assetCandidate.findFirst({
    where: { id: input.candidateId, userId: input.userId },
  })
  if (!record) return { ok: false, status: 404, error: "not found" }
  if (input.action === "reject") return rejectAssetCandidate(store, record)
  return approveAssetCandidate({
    store,
    userId: input.userId,
    record,
    promote: input.promote,
    crossProjectAllowed: input.crossProjectAllowed,
  })
}

/** 列出用户的资产候选（支持项目 / 审核状态 / 类型过滤）。 */
/**
 * @description 列出assetcandidates
 * @param input - 输入数据
 * @returns Promise<AssetCandidateRecord[]>
 */
export async function listAssetCandidates(input: {
  userId: string
  projectId?: string
  reviewStatus?: string
  kind?: string
  take?: number
  store?: AssetCandidateStorePort
}): Promise<AssetCandidateRecord[]> {
  const store = input.store ?? getDefaultAssetCandidateStore()
  return store.assetCandidate.findMany({
    where: {
      userId: input.userId,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.take ?? 200, 1), 500),
  })
}
