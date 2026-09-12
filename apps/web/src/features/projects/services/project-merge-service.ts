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
  /** Active administrator performing the merge. Not required to own either project. */
  adminUserId: string
  /** Locked-in expected owner of the source project; must match snapshot. */
  expectedSourceOwnerId: string
  /** Locked-in expected owner of the target project; must match snapshot. */
  expectedTargetOwnerId: string
  /** Idempotency / traceability key for this merge request. */
  requestId: string
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
  /** One locked binding row per owner/member/bound account in both projects. */
  participants: ProjectMergeParticipant[]
  /** Locked pre-update row count for every reviewed move table. */
  sourceRowCounts: Record<MoveProjectTable, number>
  admin: { userId: string; status: "active" | "inactive" }
}

export type ProjectMergeMoveCounts = Record<MoveProjectTable, number>

export interface ProjectMergeSuccessAudit {
  input: ProjectMergeInput
  participantIds: string[]
  rebindCount: number
  remapCount: number
  moveCounts: ProjectMergeMoveCounts
  movedRows: number
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
  moveCounts: ProjectMergeMoveCounts
  movedRows: number
  archiveCount: number
  auditId: string
}

// ----- store boundary ----------------------------------------------------

export type ProjectMergeLockInput = ProjectMergeIdentity & {
  adminUserId: string
}

export interface ProjectMergeTransaction {
  lockAndInspect(input: ProjectMergeLockInput): Promise<ProjectMergeSnapshot>
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
    await safeWriteFailedAudit(store, {
      input,
      reason: `confirmation mismatch: expected ${expectedConfirmation}`,
    })
    throw new Error(
      `confirmation mismatch: expected ${expectedConfirmation}, got ${input.confirmation}`,
    )
  }
  if (input.reason.trim() === "") {
    await safeWriteFailedAudit(store, { input, reason: "reason required" })
    throw new Error("reason required")
  }

  // Source and target must be different projects.
  if (input.sourceProjectId === input.targetProjectId) {
    await safeWriteFailedAudit(store, { input, reason: "source and target must differ" })
    throw new Error("source and target must differ")
  }

  try {
    return await store.transaction((tx) => runMergeTransaction(input, tx))
  } catch (error) {
    // Transaction rolled back (committedWrites stays empty). Record the
    // failure audit OUTSIDE the rolled-back transaction, without replacing
    // the original error.
    await safeWriteFailedAudit(store, {
      input,
      reason: error instanceof Error ? error.message : "merge failed",
    })
    throw error
  }
}

async function safeWriteFailedAudit(
  store: ProjectMergeStore,
  audit: ProjectMergeFailureAudit,
): Promise<void> {
  try {
    await store.writeFailedAudit(audit)
  } catch {
    // Audit availability must never change the failure observed by the caller.
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

  // Remap API keys for ALL participating accounts (sorted). The store reports
  // the count it actually rewrote; we record it rather than predicting it from
  // source.boundAccounts, since several authorized accounts may share a project.
  const remapCount = await tx.remapApiKeys(
    snapshot.source.projectId,
    snapshot.target.projectId,
    participantIds,
  )

  // Move rows sequentially (no Promise.all of writes).
  const moveCounts = Object.fromEntries(
    MOVE_PROJECT_TABLES.map((table) => [table, 0]),
  ) as ProjectMergeMoveCounts
  for (const table of moveTableList) {
    const count = await tx.moveRows(
      table,
      snapshot.source.projectId,
      snapshot.target.projectId,
    )
    assertExact(count, snapshot.sourceRowCounts[table], `${table} move`)
    moveCounts[table] = count
  }
  const movedRows = Object.values(moveCounts).reduce((total, count) => total + count, 0)

  // Archive source. Assert exact archive count.
  const archiveCount = await tx.archiveSource(snapshot.source.projectId)
  assertExact(archiveCount, 1, "archive")

  // Write success audit LAST.
  const auditId = await tx.writeSuccessAudit({
    input,
    participantIds,
    rebindCount,
    remapCount,
    moveCounts,
    movedRows,
    archiveCount,
  })

  return {
    participantIds,
    rebindCount,
    remapCount,
    moveCounts,
    movedRows,
    archiveCount,
    auditId,
  }
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
  // Admin must be active. Admin is a separate administrator and is NOT
  // required to own either project.
  if (snapshot.admin.status !== "active") {
    throw new Error(`admin is not active: ${snapshot.admin.userId}`)
  }
  if (snapshot.admin.userId !== input.adminUserId) {
    throw new Error(
      `admin mismatch: expected ${input.adminUserId}, got ${snapshot.admin.userId}`,
    )
  }

  // Expected owners must match the locked projects' actual owners.
  if (snapshot.source.ownerId !== input.expectedSourceOwnerId) {
    throw new Error(
      `owner mismatch: source expected ${input.expectedSourceOwnerId}, got ${snapshot.source.ownerId}`,
    )
  }
  if (snapshot.target.ownerId !== input.expectedTargetOwnerId) {
    throw new Error(
      `owner mismatch: target expected ${input.expectedTargetOwnerId}, got ${snapshot.target.ownerId}`,
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

  validateParticipantSnapshot(snapshot)
  validateSourceRowCounts(snapshot)

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

function validateParticipantSnapshot(snapshot: ProjectMergeSnapshot): void {
  const expected = sortedUniqueIds([
    snapshot.source.ownerId,
    ...snapshot.source.members,
    ...snapshot.source.boundAccounts,
    snapshot.target.ownerId,
    ...snapshot.target.members,
    ...snapshot.target.boundAccounts,
  ])
  const actual = snapshot.participants.map((participant) => participant.userId)
  if (new Set(actual).size !== actual.length) {
    throw new Error("duplicate participant binding snapshot")
  }
  const sortedActual = [...actual].sort()
  if (
    expected.length !== sortedActual.length ||
    expected.some((userId, index) => userId !== sortedActual[index])
  ) {
    throw new Error(
      `participant snapshot mismatch: expected ${expected.join(",")}, got ${sortedActual.join(",")}`,
    )
  }
}

function validateSourceRowCounts(snapshot: ProjectMergeSnapshot): void {
  for (const table of MOVE_PROJECT_TABLES) {
    const count = snapshot.sourceRowCounts[table]
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`invalid source row count for ${table}: ${String(count)}`)
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
