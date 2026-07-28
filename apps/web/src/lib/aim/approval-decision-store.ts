/**
 * ApprovalDecision 读写端口（WP-2）
 * 路由与卡片回调注入真实 prisma；单测用内存 stub。
 */

import type {
  ApprovalDecisionInput,
  ApprovalDecisionRecord,
  ApprovalSubjectType,
} from "@/lib/aim/workflow-governance"
import { resolveIdempotentApproval } from "@/lib/aim/workflow-governance"

export interface ApprovalDecisionStorePort {
  findByRequestId(requestId: string): Promise<ApprovalDecisionRecord | null>
  findById(id: string): Promise<ApprovalDecisionRecord | null>
  create(input: ApprovalDecisionInput & { id: string }): Promise<ApprovalDecisionRecord>
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
  })
  if (resolved.idempotent) return resolved
  const created = await store.create(resolved.record)
  return { record: created, idempotent: false }
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
