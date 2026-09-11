/**
 * Transactional project-merge domain service.
 *
 * This module is intentionally Prisma-free. The database row locks, raw
 * table movement and API-key remapping belong in the store adapter (Task 3).
 * Here we only orchestrate the business rules against a store boundary so
 * unit tests can drive it with an in-memory fake.
 */

import {
  MOVE_PROJECT_TABLES,
  classifyProjectTables,
} from "@/features/projects/services/project-merge-policy"

// ----- shared types ------------------------------------------------------

export type MoveProjectTable = (typeof MOVE_PROJECT_TABLES)[number]

export interface ProjectMergeIdentity {
  sourceProjectId: string
  targetProjectId: string
}

export interface ProjectMergeInput extends ProjectMergeIdentity {
  adminUserId: string
  /** Must equal `${sourceProjectId}->${targetProjectId}`. */
  confirmation: string
  /** Non-empty human-readable reason for the merge. */
  reason: string
}

export interface ProjectMergeProjectInfo {
  projectId: string
  ownerId: string
  status: "active" | "archived" | "inactive"
  members: string[]
  boundAccounts: string[]
}

export interface ProjectMergeParticipant {
  userId: string
  /** Project this participant is currently bound to (null = unbound). */
  boundProjectId: string | null
}

export interface ProjectMergeSnapshot {
  source: ProjectMergeProjectInfo
  target: ProjectMergeProjectInfo
  deployedTables: readonly string[]
  activeWork: { invocations: number; traces: number }
  participants: ProjectMergeParticipant[]
  admin: { userId: string; status: "active" | "inactive" }
}

export interface ProjectMergeSuccessAudit {
  input: ProjectMergeInput
  participantIds: string[]
  rebindCount: number
  remapCount: number
  archiveCount: number
}

export interface ProjectMergeFailureAudit {
  input: ProjectMergeInput
  reason: string
}

export interface ProjectMergeResult {
  participantIds: string[]
  rebindCount: number
  remapCount: number
  archiveCount: number
  auditId: string
}

// ----- store boundary ----------------------------------------------------

export interface ProjectMergeTransaction {
  lockAndInspect(input: ProjectMergeIdentity): Promise<ProjectMergeSnapshot>
  upsertTargetMembers(
    targetProjectId: string,
    targetOwnerId: string,
    userIds: string[],
  ): Promise<void>
  rebindParticipants(
    sourceProjectId: string,
    targetProjectId: string,
    participants: ProjectMergeParticipant[],
  ): Promise<number>
  remapApiKeys(
    sourceProjectId: string,
    targetProjectId: string,
    userIds: string[],
  ): Promise<number>
  moveRows(
    table: MoveProjectTable,
    sourceProjectId: string,
    targetProjectId: string,
  ): Promise<number>
  archiveSource(sourceProjectId: string): Promise<number>
  writeSuccessAudit(input: ProjectMergeSuccessAudit): Promise<string>
}

export interface ProjectMergeStore {
  inspect(input: ProjectMergeIdentity): Promise<ProjectMergeSnapshot>
  transaction<T>(run: (tx: ProjectMergeTransaction) => Promise<T>): Promise<T>
  writeFailedAudit(input: ProjectMergeFailureAudit): Promise<void>
}

// ----- pure helpers ------------------------------------------------------

/**
 * Remap an API-key grant's allowed-project list from source to target.
 *
 * Replaces `source` with `target`, dedupes, keeps unrelated IDs, and keeps an
 * empty list empty. Pure: no side effects, no store calls.
 */
export function remapAllowedProjects(
  allowedProjects: string[],
  sourceProjectId: string,
  targetProjectId: string,
): string[] {
  if (allowedProjects.length === 0) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of allowedProjects) {
    const mapped = id === sourceProjectId ? targetProjectId : id
    if (seen.has(mapped)) continue
    seen.add(mapped)
    out.push(mapped)
  }
  return out
}

// ----- preview -----------------------------------------------------------

export async function previewProjectMerge(
  input: ProjectMergeIdentity,
  store: ProjectMergeStore,
): Promise<ProjectMergeSnapshot> {
  // Preview is read-only: never call write methods on the store.
  return store.inspect(input)
}

// ----- apply -------------------------------------------------------------

export async function applyProjectMerge(
  input: ProjectMergeInput,
  store: ProjectMergeStore,
): Promise<ProjectMergeResult> {
  // 1. Validate confirmation + reason BEFORE opening the transaction.
  const expectedConfirmation = `${input.sourceProjectId}->${input.targetProjectId}`
  if (input.confirmation !== expectedConfirmation) {
    await store.writeFailedAudit({
      input,
      reason: `confirmation mismatch: expected ${expectedConfirmation}`,
    })
    throw new Error(
      `confirmation mismatch: expected ${expectedConfirmation}, got ${input.confirmation}`,
    )
  }
  if (input.reason.trim() === "") {
    await store.writeFailedAudit({ input, reason: "reason required" })
    throw new Error("reason required")
  }

  try {
    return await store.transaction((tx) => runMergeTransaction(input, tx))
  } catch (error) {
    // Transaction rolled back (committedWrites stays empty). Record the
    // failure audit OUTSIDE the rolled-back transaction, without replacing
    // the original error.
    await store.writeFailedAudit({
      input,
      reason: error instanceof Error ? error.message : "merge failed",
    })
    throw error
  }
}

async function runMergeTransaction(
  input: ProjectMergeInput,
  tx: ProjectMergeTransaction,
): Promise<ProjectMergeResult> {
  // Lock and inspect inside the transaction. Use ONLY this data.
  const snapshot = await tx.lockAndInspect(input)
  validateSnapshot(input, snapshot)

  const participantIds = sortedUniqueIds(
    snapshot.participants.map((p) => p.userId),
  )
  const moveTableList = computeMoveTables(snapshot.deployedTables)

  // Upsert target members (union of all participants).
  await tx.upsertTargetMembers(
    snapshot.target.projectId,
    snapshot.target.ownerId,
    participantIds,
  )

  // Rebind participants bound to source onto target. Assert exact count.
  const expectedRebind = countBoundTo(snapshot, snapshot.source.projectId)
  const rebindCount = await tx.rebindParticipants(
    snapshot.source.projectId,
    snapshot.target.projectId,
    snapshot.participants,
  )
  assertExact(rebindCount, expectedRebind, "rebind")

  // Remap API keys bound to source accounts. Assert exact count.
  const expectedRemap = snapshot.source.boundAccounts.length
  const remapCount = await tx.remapApiKeys(
    snapshot.source.projectId,
    snapshot.target.projectId,
    snapshot.source.boundAccounts,
  )
  assertExact(remapCount, expectedRemap, "remap")

  // Move rows sequentially (no Promise.all of writes).
  for (const table of moveTableList) {
    await tx.moveRows(table, snapshot.source.projectId, snapshot.target.projectId)
  }

  // Archive source. Assert exact archive count.
  const archiveCount = await tx.archiveSource(snapshot.source.projectId)
  assertExact(archiveCount, 1, "archive")

  // Write success audit LAST.
  const auditId = await tx.writeSuccessAudit({
    input,
    participantIds,
    rebindCount,
    remapCount,
    archiveCount,
  })

  return { participantIds, rebindCount, remapCount, archiveCount, auditId }
}

function countBoundTo(
  snapshot: ProjectMergeSnapshot,
  projectId: string,
): number {
  return snapshot.participants.filter((p) => p.boundProjectId === projectId).length
}

function assertExact(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label} count mismatch: expected ${expected}, got ${actual}`)
  }
}

// ----- internal validators ----------------------------------------------

function validateSnapshot(
  input: ProjectMergeInput,
  snapshot: ProjectMergeSnapshot,
): void {
  // Admin must be active.
  if (snapshot.admin.status !== "active") {
    throw new Error(`admin is not active: ${snapshot.admin.userId}`)
  }

  // Admin must own the source project.
  if (snapshot.source.ownerId !== input.adminUserId) {
    throw new Error(
      `owner mismatch: admin ${input.adminUserId} is not owner of ${snapshot.source.projectId}`,
    )
  }

  // Source must not already be archived.
  if (snapshot.source.status === "archived") {
    throw new Error(`source project is archived: ${snapshot.source.projectId}`)
  }

  // Target must be active.
  if (snapshot.target.status !== "active") {
    throw new Error(
      `target project is not active: ${snapshot.target.projectId}`,
    )
  }

  // Reject unknown deployed tables.
  const { unknown } = classifyProjectTables(snapshot.deployedTables)
  if (unknown.length > 0) {
    throw new Error(`unknown deployed table: ${unknown[0]}`)
  }

  // Block active source work.
  if (snapshot.activeWork.invocations > 0 || snapshot.activeWork.traces > 0) {
    throw new Error(
      `active work in progress: ${snapshot.activeWork.invocations} invocations, ${snapshot.activeWork.traces} traces`,
    )
  }

  // No participant may be bound to a third project.
  for (const p of snapshot.participants) {
    if (
      p.boundProjectId !== null &&
      p.boundProjectId !== snapshot.source.projectId &&
      p.boundProjectId !== snapshot.target.projectId
    ) {
      throw new Error(
        `participant ${p.userId} is bound to a third project: ${p.boundProjectId}`,
      )
    }
  }
}

function computeMoveTables(deployedTables: readonly string[]): MoveProjectTable[] {
  const { move } = classifyProjectTables(deployedTables)
  return move as MoveProjectTable[]
}

function sortedUniqueIds(ids: string[]): string[] {
  const seen = new Set<string>()
  for (const id of ids) {
    if (!seen.has(id)) seen.add(id)
  }
  return [...seen].sort()
}
