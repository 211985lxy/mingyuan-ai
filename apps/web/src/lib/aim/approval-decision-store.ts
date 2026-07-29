/**
 * ApprovalDecision 读写端口（WP-2）
 * 路由与卡片回调注入真实 prisma；单测用内存 stub。
 */

import type {
  ApprovalDecisionInput,
  ApprovalDecisionRecord,
  ApprovalEffectStatus,
  ApprovalSubjectType,
} from "@/lib/aim/workflow-governance"
import { resolveIdempotentApproval } from "@/lib/aim/workflow-governance"

export interface ApprovalDecisionStorePort {
  findByRequestId(requestId: string): Promise<ApprovalDecisionRecord | null>
  findById(id: string): Promise<ApprovalDecisionRecord | null>
  findBySubject(
    subjectType: ApprovalSubjectType,
    subjectId: string,
  ): Promise<ApprovalDecisionRecord[]>
  create(input: ApprovalDecisionInput & { id: string }): Promise<ApprovalDecisionRecord>
  updateEffect(
    id: string,
    patch: { effectStatus: ApprovalEffectStatus; effectError?: string | null },
  ): Promise<ApprovalDecisionRecord>
}

function isUniqueConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: string }).code
  return code === "P2002"
}

export async function recordApprovalDecision(
  store: ApprovalDecisionStorePort,
  input: ApprovalDecisionInput,
  idFactory: () => string = () => `apd_${Date.now().toString(36)}`,
): Promise<{ record: ApprovalDecisionRecord; idempotent: boolean }> {
  const existing = await store.findByRequestId(input.requestId)
  const resolved = resolveIdempotentApproval(existing, {
    ...input,
    id: idFactory(),
    effectStatus: input.effectStatus ?? "none",
  })
  if (resolved.idempotent) return resolved
  try {
    const created = await store.create(resolved.record)
    return { record: created, idempotent: false }
  } catch (error) {
    // 并发回调：唯一键冲突后回读，按幂等处理
    if (isUniqueConflict(error)) {
      const raced = await store.findByRequestId(input.requestId)
      if (raced) return { record: raced, idempotent: true }
    }
    throw error
  }
}

export async function loadApprovalForSubject(
  store: ApprovalDecisionStorePort,
  approvalId: string | null | undefined,
  subjectType: ApprovalSubjectType,
  subjectId: string,
): Promise<ApprovalDecisionRecord | null> {
  if (!approvalId?.trim()) return null
  const row = await store.findById(approvalId.trim())
  if (!row) return null
  if (row.subjectType !== subjectType || row.subjectId !== subjectId) return null
  return row
}

export async function loadApprovalsForSubject(
  store: ApprovalDecisionStorePort,
  subjectType: ApprovalSubjectType,
  subjectId: string,
): Promise<ApprovalDecisionRecord[]> {
  return store.findBySubject(subjectType, subjectId)
}
