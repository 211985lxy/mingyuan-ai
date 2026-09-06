import { createHash, createHmac, randomUUID } from "node:crypto"
import { prisma } from "@/lib/prisma"
import type { Prisma, PrismaClient } from "@/generated/prisma/client"
import { ApiRequestError } from "@/lib/api-contract"
import {
  BACKGROUND_TASK_STATUS,
  cancelStaleProjectBackgroundTask,
} from "@/lib/background-tasks"
import { incrementIsolationMetric } from "@/lib/account-project-isolation-metrics"

export type AccountProjectContextStatus =
  | "bound"
  | "setup_required"
  | "admin_review_required"
  | "inactive_project_recovery_required"

/** Project statuses that mean the project is paused / not usable for the account. */
export const INACTIVE_PROJECT_STATUSES = ["paused", "archived"] as const
export const ACTIVE_PROJECT_STATUS = "active"

export function isInactiveProjectStatus(status: string): boolean {
  return (INACTIVE_PROJECT_STATUSES as readonly string[]).includes(status)
}

export type AccountProjectStatusCounts = {
  activeProjectCount: number
  inactiveProjectCount: number
}

/**
 * Canonical account-project status derivation (Task 7): active and inactive
 * projects are counted separately so an account whose only projects are
 * paused/archived lands in `inactive_project_recovery_required` instead of the
 * create-first-project or admin-review buckets. This is the SINGLE source of
 * truth shared by the context read, first-project creation and the admin list.
 */
export function deriveAccountProjectContextStatus(
  counts: AccountProjectStatusCounts,
): AccountProjectContextStatus {
  if (counts.activeProjectCount > 0) return "admin_review_required"
  if (counts.inactiveProjectCount > 0) return "inactive_project_recovery_required"
  return "setup_required"
}

/** Derive the admin-list status straight from a user row + its project rows. */
export function deriveAccountProjectBindingStatus(input: {
  boundProjectId: string | null
  projects: Array<{ status: string }>
}): AccountProjectContextStatus {
  if (input.boundProjectId) return "bound"
  let activeProjectCount = 0
  let inactiveProjectCount = 0
  for (const project of input.projects) {
    if (project.status === ACTIVE_PROJECT_STATUS) activeProjectCount += 1
    else if (isInactiveProjectStatus(project.status)) inactiveProjectCount += 1
  }
  return deriveAccountProjectContextStatus({ activeProjectCount, inactiveProjectCount })
}

export type BoundProject = {
  id: string
  name: string
  status: string
}

export type InitialAccountProjectInput = {
  name: string
  companyName?: string | null
  industry?: string | null
  targetCustomer?: string | null
  offer?: string | null
  deliveryGoal?: string | null
  notes?: string | null
}

export type AccountProjectContext =
  | { status: "bound"; project: BoundProject }
  | { status: "setup_required" }
  | { status: "admin_review_required"; projectCount: number }
  | { status: "inactive_project_recovery_required"; projectCount: number }

export type AccountProjectContextErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_PROJECT_SETUP_REQUIRED"
  | "ACCOUNT_PROJECT_REVIEW_REQUIRED"
  | "ACCOUNT_PROJECT_RECOVERY_REQUIRED"
  | "ACCOUNT_ALREADY_BOUND"
  | "ACCOUNT_BINDING_CHANGED"
  | "PROJECT_CONTEXT_MISMATCH"
  | "BOUND_PROJECT_UNAVAILABLE"
  | "PROJECT_NOT_FOUND"
  | "TARGET_NOT_ACTIVE"

export class AccountProjectContextError extends ApiRequestError {
  readonly code: AccountProjectContextErrorCode

  constructor(code: AccountProjectContextErrorCode, message: string, status = 409) {
    super(status, code, message)
    this.name = "AccountProjectContextError"
    this.code = code
  }
}

/**
 * Stable error code used when a worker discovers, after claiming a task, that
 * the account's bound project no longer matches the project the task was queued
 * against. This is NOT recoverable — the task must be failed without retry.
 */
export const ACCOUNT_PROJECT_CONTEXT_STALE = "ACCOUNT_PROJECT_CONTEXT_STALE"

/** Generic, non-leaking message returned to callers when the binding went stale. */
export const ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE = "账号项目配置已变化，请联系管理员"

export type AccountProjectExecutionContextSource =
  | "web"
  | "remote"
  | "newsroom"
  | "inspiration"
  | "background"

const projectSelect = {
  id: true,
  name: true,
  status: true,
} as const

type ProjectCountDb = Pick<PrismaClient, "clientProject">

async function getUserBinding(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { boundProjectId: true },
  })

  if (!user) {
    throw new AccountProjectContextError("ACCOUNT_NOT_FOUND", "账号不存在", 404)
  }

  return user.boundProjectId
}

/** Count active vs inactive projects of an account (the status-model inputs). */
async function countAccountProjects(
  db: ProjectCountDb,
  userId: string,
): Promise<AccountProjectStatusCounts> {
  const [activeProjectCount, inactiveProjectCount] = await Promise.all([
    db.clientProject.count({
      where: { userId, status: ACTIVE_PROJECT_STATUS },
    }),
    db.clientProject.count({
      where: { userId, status: { in: [...INACTIVE_PROJECT_STATUSES] } },
    }),
  ])
  return { activeProjectCount, inactiveProjectCount }
}

export async function getAccountProjectContext(
  userId: string,
): Promise<AccountProjectContext> {
  const boundProjectId = await getUserBinding(userId)

  if (boundProjectId) {
    const project = await prisma.clientProject.findFirst({
      where: { id: boundProjectId, userId, status: "active" },
      select: projectSelect,
    })

    if (!project) {
      throw new AccountProjectContextError(
        "BOUND_PROJECT_UNAVAILABLE",
        "账号绑定的项目不可用",
      )
    }

    return { status: "bound", project }
  }

  const counts = await countAccountProjects(prisma, userId)
  const status = deriveAccountProjectContextStatus(counts)

  if (status === "admin_review_required") {
    return { status, projectCount: counts.activeProjectCount }
  }
  if (status === "inactive_project_recovery_required") {
    return { status, projectCount: counts.inactiveProjectCount }
  }
  return { status: "setup_required" }
}

export async function resolveBoundProject(options: {
  userId: string
  requestedProjectId?: string | null
}): Promise<BoundProject> {
  const boundProjectId = await getUserBinding(options.userId)
  const requestedProjectId = options.requestedProjectId?.trim() || null

  if (!boundProjectId) {
    const context = await getAccountProjectContext(options.userId)
    if (context.status === "setup_required") {
      throw new AccountProjectContextError(
        "ACCOUNT_PROJECT_SETUP_REQUIRED",
        "账号尚未绑定项目，请先完成项目设置",
      )
    }
    throw new AccountProjectContextError(
      "ACCOUNT_PROJECT_REVIEW_REQUIRED",
      "账号存在未绑定项目，请联系管理员完成绑定",
    )
  }

  if (requestedProjectId && requestedProjectId !== boundProjectId) {
    throw new AccountProjectContextError(
      "PROJECT_CONTEXT_MISMATCH",
      "当前账号只能使用已绑定的项目",
    )
  }

  const project = await prisma.clientProject.findFirst({
    where: { id: boundProjectId, userId: options.userId, status: "active" },
    select: projectSelect,
  })

  if (!project) {
    throw new AccountProjectContextError(
      "BOUND_PROJECT_UNAVAILABLE",
      "账号绑定的项目不可用",
    )
  }

  return project
}

export async function resolveBoundProjectId(options: {
  userId: string
  requestedProjectId?: string | null
}): Promise<string> {
  const project = await resolveBoundProject(options)
  return project.id
}

/**
 * 账号绑定执行总闸门（Execution Gate）。
 *
 * 任何模型调用 / 异步 worker 在真正执行前必须调用本函数，重新校验“这个账号
 * 的绑定项目 == 本次请求/任务声明的项目”。它一律通过 `resolveBoundProject`
 * 裁决（传入 `requestedProjectId`），**绝不复制另一套绑定规则**。
 *
 * 校验失败时抛出 `AccountProjectContextError`，错误码区分：
 * - `PROJECT_CONTEXT_MISMATCH`：请求项目 ≠ 绑定项目
 * - `BOUND_PROJECT_UNAVAILABLE`：绑定项目已停用 / 不存在
 * - `ACCOUNT_NOT_FOUND` / `ACCOUNT_PROJECT_SETUP_REQUIRED` / `ACCOUNT_PROJECT_REVIEW_REQUIRED`
 */
export async function assertAccountProjectExecutionContext(input: {
  userId: string
  projectId: string
  source: AccountProjectExecutionContextSource
}): Promise<BoundProject> {
  // 整个“请求 vs 绑定”的判定交由 resolveBoundProject 完成，这里只做转发。
  return resolveBoundProject({ userId: input.userId, requestedProjectId: input.projectId })
}

/**
 * Minimal, safe audit line for a LEGACY null-project background task (the owning
 * record carries NO project id, e.g. queued before account-project scoping). Such
 * a task has no verifiable project boundary once the account is bound/rebound, so
 * the worker quarantines it instead of resolving to the current binding. Logs
 * ONLY safe identifiers (source, task id, user id) + the stable stale code —
 * never customer content, and never project ids (there is no legitimate one).
 */
export async function logLegacyNullProjectTaskRejection(input: {
  source: AccountProjectExecutionContextSource
  taskId: string
  userId: string
}): Promise<void> {
  // eslint-disable-next-line no-console
  console.error(`[account-project-context-stale]`, {
    source: input.source,
    taskId: input.taskId,
    userId: input.userId,
    expectedProjectId: null,
    boundProjectId: null,
    code: ACCOUNT_PROJECT_CONTEXT_STALE,
  })
}

/** Narrow an unknown error to the typed account-project context error. */
export function isAccountProjectContextError(error: unknown): error is AccountProjectContextError {
  return error instanceof AccountProjectContextError
}

/** Stable, non-leaking error string persisted on the background task. */
export function accountProjectContextStaleErrorString(): string {
  return `${ACCOUNT_PROJECT_CONTEXT_STALE}: ${ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE}`
}

/**
 * Emit a minimal, safe audit log for a stale account-project binding.
 *
 * Security: NEVER logs customer content, chat text, or knowledge body — only the
 * safe identifiers (userId, task id, expected project id, current bound id, and
 * the error code). `expectedProjectId` is the project the task was queued for;
 * `boundProjectId` (actual) is re-read from the account binding for context.
 */
export async function logAccountProjectContextRejection(input: {
  source: AccountProjectExecutionContextSource
  userId: string
  taskId: string
  expectedProjectId: string
  error: unknown
}): Promise<void> {
  let boundProjectId: string | null = null
  let code: AccountProjectContextErrorCode | "UNKNOWN" = "UNKNOWN"
  if (isAccountProjectContextError(input.error)) {
    code = input.error.code
    // Isolation observability: every gate rejection counts with content-free
    // dimensions ONLY — entry type + stable error code (see
    // account-project-isolation-metrics.ts). Never user ids, project names or
    // any customer/body text.
    incrementIsolationMetric("project_context_mismatch_total", {
      entry: input.source,
      code,
    })
    try {
      boundProjectId = await getUserBinding(input.userId)
    } catch {
      boundProjectId = null
    }
  }
  console.error(`[account-project-context-stale]`, {
    source: input.source,
    taskId: input.taskId,
    userId: input.userId,
    expectedProjectId: input.expectedProjectId,
    boundProjectId,
    code,
  })
}

export async function createInitialAccountProject(
  userId: string,
  input: InitialAccountProjectInput,
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { boundProjectId: true },
    })

    if (!user) {
      throw new AccountProjectContextError("ACCOUNT_NOT_FOUND", "账号不存在", 404)
    }

    if (user.boundProjectId) {
      throw new AccountProjectContextError(
        "ACCOUNT_ALREADY_BOUND",
        "账号已经绑定项目，不能重复创建",
      )
    }

    // 创建首个项目时使用与状态判定相同的口径（active vs inactive 分开统计）：
    // 只有真正“零项目”的账号（setup_required）可以自助创建；仅有停用项目的
    // 账号必须走管理员恢复，避免死循环。
    const counts = await countAccountProjects(tx as unknown as ProjectCountDb, userId)
    const status = deriveAccountProjectContextStatus(counts)
    if (status !== "setup_required") {
      throw new AccountProjectContextError(
        status === "admin_review_required"
          ? "ACCOUNT_PROJECT_REVIEW_REQUIRED"
          : "ACCOUNT_PROJECT_RECOVERY_REQUIRED",
        status === "admin_review_required"
          ? "账号存在未绑定项目，请联系管理员完成绑定"
          : "账号仅存在停用项目，请联系管理员恢复后绑定",
      )
    }

    const data: Prisma.ClientProjectUncheckedCreateInput = {
      userId,
      name: input.name,
    }
    for (const key of [
      "companyName",
      "industry",
      "targetCustomer",
      "offer",
      "deliveryGoal",
      "notes",
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key] ?? null
    }

    const project = await tx.clientProject.create({ data })
    // Conditional update closes the first-project race: if two requests pass
    // the count check concurrently, only one can claim the still-unbound row;
    // the losing transaction rolls back its just-created project.
    const binding = await tx.user.updateMany({
      where: { id: userId, boundProjectId: null },
      data: {
        boundProjectId: project.id,
        projectBoundAt: new Date(),
        projectBindingSource: "self_created",
      },
    })
    if (binding.count === 0) {
      throw new AccountProjectContextError(
        "ACCOUNT_ALREADY_BOUND",
        "账号已经绑定项目，不能重复创建",
      )
    }

    return project
  })
}

export async function bindAccountProject(options: {
  userId: string
  projectId: string
  source?: "admin_review" | "migration"
}) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: options.userId },
      select: { boundProjectId: true },
    })

    if (!user) {
      throw new AccountProjectContextError("ACCOUNT_NOT_FOUND", "账号不存在", 404)
    }

    if (user.boundProjectId && user.boundProjectId !== options.projectId) {
      throw new AccountProjectContextError(
        "ACCOUNT_ALREADY_BOUND",
        "账号已经绑定其他项目，不能替换",
      )
    }

    const project = await tx.clientProject.findUnique({
      where: { id: options.projectId },
      select: { id: true, userId: true, name: true, status: true },
    })

    if (!project || project.userId !== options.userId) {
      throw new AccountProjectContextError(
        "PROJECT_CONTEXT_MISMATCH",
        "项目不属于当前账号",
      )
    }
    if (project.status !== "active") {
      throw new AccountProjectContextError(
        "BOUND_PROJECT_UNAVAILABLE",
        "只能绑定 active 项目",
      )
    }

    if (user.boundProjectId === project.id) return project

    const binding = await tx.user.updateMany({
      where: { id: options.userId, boundProjectId: null },
      data: {
        boundProjectId: project.id,
        projectBoundAt: new Date(),
        projectBindingSource: options.source ?? "admin_review",
      },
    })
    if (binding.count === 0) {
      throw new AccountProjectContextError(
        "ACCOUNT_ALREADY_BOUND",
        "账号已经绑定其他项目，不能替换",
      )
    }

    return project
  })
}

// ---------------------------------------------------------------------------
// Task 7 — admin preview / audited repair + confirmation token
// ---------------------------------------------------------------------------

type RepairImpactDb = Pick<
  PrismaClient,
  | "user"
  | "clientProject"
  | "knowledgeEntry"
  | "script"
  | "aimGeneration"
  | "agentInvocation"
  | "backgroundTask"
>

export type AccountProjectRepairImpact = {
  userId: string
  currentBinding: { id: string; name: string; status: string } | null
  targetProject: { id: string; name: string; status: string }
  reactivationRequired: boolean
  targetContentCounts: {
    knowledgeEntries: number
    scripts: number
    aimGenerations: number
  }
  /** Pending old-project work that the repair would quarantine. */
  wouldCancel: {
    agentInvocations: number
    backgroundTasks: number
  }
  /** Historical records that stay under the old project (cannot be auto-attributed). */
  unattributedHistoryCount: number
}

type PendingAgentProjectWork = {
  pendingInvocations: Array<{ id: string; backgroundTaskId: string | null }>
  backgroundTaskIds: string[]
}

/**
 * Enumerate the account's pending work for a project it is leaving:
 * - queued/running AgentInvocation rows that carry userId + projectId directly;
 * - their linked BackgroundTasks, plus orphan queued/leased/retry-wait
 *   BackgroundTasks whose aggregate is one of those invocations.
 *
 * BackgroundTask itself has no project column (Task 6 review note), so the
 * enumeration is done through the project-scoped aggregate rows. Completed
 * history is never matched.
 */
async function findPendingAgentProjectWork(
  db: RepairImpactDb,
  input: { userId: string; projectId: string },
): Promise<PendingAgentProjectWork> {
  const pendingInvocations = await db.agentInvocation.findMany({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      status: { in: ["queued", "running"] },
    },
    select: { id: true, backgroundTaskId: true },
  })
  const invocationIds = pendingInvocations.map((invocation) => invocation.id)
  const linkedTaskIds = pendingInvocations
    .map((invocation) => invocation.backgroundTaskId)
    .filter((id): id is string => Boolean(id))

  const orphanTasks =
    invocationIds.length > 0
      ? await db.backgroundTask.findMany({
          where: {
            aggregateType: "agent_invocation",
            aggregateId: { in: invocationIds },
            status: {
              in: [
                BACKGROUND_TASK_STATUS.queued,
                BACKGROUND_TASK_STATUS.leased,
                BACKGROUND_TASK_STATUS.retryWait,
              ],
            },
          },
          select: { id: true },
        })
      : []

  return {
    pendingInvocations,
    backgroundTaskIds: [
      ...new Set([...linkedTaskIds, ...orphanTasks.map((task) => task.id)]),
    ],
  }
}

/**
 * Quarantine the enumerated old-project work. AgentInvocation rows are failed
 * with the stable ACCOUNT_PROJECT_CONTEXT_STALE code (same semantics as
 * `failStaleProjectAgentInvocation` in invocation-service.ts, applied inline to
 * keep this module free of that service's import graph); pending BackgroundTasks
 * are cancelled via the Task 6 primitive `cancelStaleProjectBackgroundTask`.
 * Only pending / in-flight rows are touched; completed history is never
 * rewritten.
 */
async function quarantinePendingAgentProjectWork(
  db: RepairImpactDb,
  input: { userId: string; projectId: string },
): Promise<{ failedInvocationCount: number; cancelledTaskCount: number }> {
  const pending = await findPendingAgentProjectWork(db, input)
  const now = new Date()
  let failedInvocationCount = 0
  let cancelledTaskCount = 0

  for (const invocation of pending.pendingInvocations) {
    const updated = await db.agentInvocation.updateMany({
      where: { id: invocation.id, status: { in: ["queued", "running"] } },
      data: {
        status: "failed",
        errorCode: ACCOUNT_PROJECT_CONTEXT_STALE,
        errorMessage: ACCOUNT_PROJECT_CONTEXT_STALE_MESSAGE,
        completedAt: now,
      },
    })
    if (updated.count > 0) {
      failedInvocationCount += updated.count
      // Same content-free quarantine counter as failStaleProjectAgentInvocation
      // (applied inline here to keep this module free of that service's import
      // graph): a stale queued/running invocation was actually quarantined.
      incrementIsolationMetric("stale_task_quarantined_total", {
        code: ACCOUNT_PROJECT_CONTEXT_STALE,
      })
    }
  }
  for (const taskId of pending.backgroundTaskIds) {
    cancelledTaskCount += await cancelStaleProjectBackgroundTask(db as never, taskId, now)
  }

  return { failedInvocationCount, cancelledTaskCount }
}

/**
 * Read-only impact preview for an admin repair/recovery. Counts only — NEVER
 * returns knowledge/script/generation body content.
 */
export async function getAccountProjectRepairImpact(
  db: RepairImpactDb,
  input: { userId: string; targetProjectId: string; reactivate: boolean },
): Promise<AccountProjectRepairImpact> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      boundProjectId: true,
      boundProject: { select: { id: true, name: true, status: true } },
    },
  })
  if (!user) {
    throw new AccountProjectContextError("ACCOUNT_NOT_FOUND", "账号不存在", 404)
  }

  const target = await db.clientProject.findUnique({
    where: { id: input.targetProjectId },
    select: { id: true, userId: true, name: true, status: true },
  })
  if (!target) {
    throw new AccountProjectContextError("PROJECT_NOT_FOUND", "目标项目不存在", 404)
  }
  if (target.userId !== input.userId) {
    throw new AccountProjectContextError(
      "PROJECT_CONTEXT_MISMATCH",
      "项目不属于当前账号",
    )
  }
  if (target.status !== ACTIVE_PROJECT_STATUS && !input.reactivate) {
    throw new AccountProjectContextError(
      "TARGET_NOT_ACTIVE",
      "目标项目不是 active；如需停用项目恢复请勾选恢复为 active",
    )
  }

  const previousProjectId = user.boundProjectId
  const leavingPrevious = Boolean(previousProjectId) && previousProjectId !== target.id

  const [knowledgeEntries, scripts, targetAimGenerations] = await Promise.all([
    db.knowledgeEntry.count({
      where: { userId: input.userId, projectId: target.id },
    }),
    db.script.count({
      where: { userId: input.userId, projectId: target.id },
    }),
    db.aimGeneration.count({
      where: { userId: input.userId, projectId: target.id },
    }),
  ])

  let pending: PendingAgentProjectWork = { pendingInvocations: [], backgroundTaskIds: [] }
  if (leavingPrevious && previousProjectId) {
    pending = await findPendingAgentProjectWork(db, {
      userId: input.userId,
      projectId: previousProjectId,
    })
  }

  let unattributedHistoryCount = 0
  if (leavingPrevious && previousProjectId) {
    unattributedHistoryCount = await db.aimGeneration.count({
      where: { userId: input.userId, projectId: previousProjectId },
    })
  }

  return {
    userId: input.userId,
    currentBinding: user.boundProject
      ? {
          id: user.boundProject.id,
          name: user.boundProject.name,
          status: user.boundProject.status,
        }
      : null,
    targetProject: {
      id: target.id,
      name: target.name,
      status: target.status,
    },
    reactivationRequired: target.status !== ACTIVE_PROJECT_STATUS,
    targetContentCounts: {
      knowledgeEntries,
      scripts,
      aimGenerations: targetAimGenerations,
    },
    wouldCancel: {
      agentInvocations: pending.pendingInvocations.length,
      backgroundTasks: pending.backgroundTaskIds.length,
    },
    unattributedHistoryCount,
  }
}

export type AccountProjectRepairResult = {
  previousProjectId: string | null
  nextProjectId: string
  target: { id: string; name: string; status: string }
  reactivated: boolean
  failedInvocationCount: number
  cancelledTaskCount: number
  unattributedHistoryCount: number
}

/**
 * Dedicated audited repair — separate from `bindAccountProject`, which must
 * CONTINUE to forbid replacement. All-or-nothing: the binding re-claim, optional
 * reactivation and the old-project quarantine run inside one transaction, so a
 * failed quarantine rolls the binding change back (no half-state).
 */
export async function repairAccountProjectBinding(options: {
  userId: string
  previousProjectId: string | null
  nextProjectId: string
  reactivateNext: boolean
}): Promise<AccountProjectRepairResult> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: options.userId },
      select: { boundProjectId: true },
    })
    if (!user) {
      throw new AccountProjectContextError("ACCOUNT_NOT_FOUND", "账号不存在", 404)
    }
    if (user.boundProjectId !== options.previousProjectId) {
      throw new AccountProjectContextError(
        "ACCOUNT_BINDING_CHANGED",
        "账号绑定已变化，请重新预览后再执行",
      )
    }

    const target = await tx.clientProject.findUnique({
      where: { id: options.nextProjectId },
      select: { id: true, userId: true, name: true, status: true },
    })
    if (!target) {
      throw new AccountProjectContextError("PROJECT_NOT_FOUND", "目标项目不存在", 404)
    }
    if (target.userId !== options.userId) {
      throw new AccountProjectContextError(
        "PROJECT_CONTEXT_MISMATCH",
        "项目不属于当前账号",
      )
    }

    let reactivated = false
    if (target.status !== ACTIVE_PROJECT_STATUS) {
      if (!options.reactivateNext) {
        throw new AccountProjectContextError(
          "TARGET_NOT_ACTIVE",
          "目标项目不是 active；如需停用项目恢复请先勾选恢复为 active",
        )
      }
      reactivated = true
      await tx.clientProject.update({
        where: { id: target.id },
        data: { status: ACTIVE_PROJECT_STATUS },
      })
    }

    const sameBinding = user.boundProjectId === options.nextProjectId
    if (!sameBinding) {
      // Conditional re-claim closes the concurrent-admin race: if the binding
      // moved since the preview token was issued, zero rows match and we abort.
      const claim = await tx.user.updateMany({
        where: {
          id: options.userId,
          boundProjectId: options.previousProjectId,
        },
        data: {
          boundProjectId: options.nextProjectId,
          projectBoundAt: new Date(),
          projectBindingSource: "admin_repair",
        },
      })
      if (claim.count !== 1) {
        throw new AccountProjectContextError(
          "ACCOUNT_BINDING_CHANGED",
          "账号绑定已变化，请重新预览后再执行",
        )
      }
    }

    let unattributedHistoryCount = 0
    let failedInvocationCount = 0
    let cancelledTaskCount = 0
    if (options.previousProjectId && !sameBinding) {
      unattributedHistoryCount = await tx.aimGeneration.count({
        where: { userId: options.userId, projectId: options.previousProjectId },
      })
      const quarantined = await quarantinePendingAgentProjectWork(
        tx as unknown as RepairImpactDb,
        { userId: options.userId, projectId: options.previousProjectId },
      )
      failedInvocationCount = quarantined.failedInvocationCount
      cancelledTaskCount = quarantined.cancelledTaskCount
    }

    return {
      previousProjectId: options.previousProjectId,
      nextProjectId: options.nextProjectId,
      target: {
        id: target.id,
        name: target.name,
        status: reactivated ? ACTIVE_PROJECT_STATUS : target.status,
      },
      reactivated,
      failedInvocationCount,
      cancelledTaskCount,
      unattributedHistoryCount,
    }
  })
}

// ---------------------------------------------------------------------------
// Short-lived HMAC confirmation token (admin two-step confirm → atomic repair)
// ---------------------------------------------------------------------------

export const ACCOUNT_PROJECT_REPAIR_TOKEN_TTL_MS = 10 * 60 * 1000
const ACCOUNT_PROJECT_REPAIR_TOKEN_PURPOSE = "account_project_repair"
const ACCOUNT_PROJECT_REPAIR_TOKEN_VERSION = 1 as const

export type AccountProjectRepairTokenPayload = {
  v: typeof ACCOUNT_PROJECT_REPAIR_TOKEN_VERSION
  purpose: typeof ACCOUNT_PROJECT_REPAIR_TOKEN_PURPOSE
  userId: string
  previousProjectId: string | null
  projectId: string
  reactivate: boolean
  reasonHash: string
  issuedAtMs: number
  expiresAtMs: number
  nonce: string
}

export function hashAccountProjectRepairReason(reason: string): string {
  return createHash("sha256").update(reason, "utf8").digest("hex")
}

/** Server-side secret shared with the admin session (lazily read, ≥32 chars). */
function repairTokenSecret(): string {
  const secret = process.env.ADMIN_JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      "ADMIN_JWT_SECRET 未配置或长度不足(需 ≥32 字符)，无法签发/校验账号项目修复确认 token",
    )
  }
  return secret
}

function signRepairTokenPayload(encoded: string): string {
  return createHmac("sha256", repairTokenSecret())
    .update(encoded, "utf8")
    .digest("hex")
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Mint a short-lived, stateless confirmation token for an admin repair. The
 * token binds userId + previousProjectId + targetProjectId + reactivation +
 * reason so it cannot be replayed against a different target or reason.
 */
export function createAccountProjectRepairToken(input: {
  userId: string
  previousProjectId: string | null
  projectId: string
  reactivate: boolean
  reason: string
  nowMs?: number
}): string {
  const issuedAtMs = input.nowMs ?? Date.now()
  const payload: AccountProjectRepairTokenPayload = {
    v: ACCOUNT_PROJECT_REPAIR_TOKEN_VERSION,
    purpose: ACCOUNT_PROJECT_REPAIR_TOKEN_PURPOSE,
    userId: input.userId,
    previousProjectId: input.previousProjectId,
    projectId: input.projectId,
    reactivate: input.reactivate,
    reasonHash: hashAccountProjectRepairReason(input.reason),
    issuedAtMs,
    expiresAtMs: issuedAtMs + ACCOUNT_PROJECT_REPAIR_TOKEN_TTL_MS,
    nonce: randomUUID(),
  }
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${encoded}.${signRepairTokenPayload(encoded)}`
}

/** Verify a repair confirmation token; returns null when invalid or expired. */
export function verifyAccountProjectRepairToken(
  token: string,
  nowMs = Date.now(),
): AccountProjectRepairTokenPayload | null {
  const separator = token.lastIndexOf(".")
  if (separator <= 0 || separator === token.length - 1) return null

  const encoded = token.slice(0, separator)
  const signature = token.slice(separator + 1)
  if (!constantTimeEqual(signRepairTokenPayload(encoded), signature)) return null

  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!payload || typeof payload !== "object") return null

  const record = payload as Record<string, unknown>
  if (record.v !== ACCOUNT_PROJECT_REPAIR_TOKEN_VERSION) return null
  if (record.purpose !== ACCOUNT_PROJECT_REPAIR_TOKEN_PURPOSE) return null
  if (typeof record.userId !== "string") return null
  if (record.previousProjectId !== null && typeof record.previousProjectId !== "string") {
    return null
  }
  if (typeof record.projectId !== "string") return null
  if (typeof record.reasonHash !== "string") return null
  if (typeof record.expiresAtMs !== "number" || record.expiresAtMs <= nowMs) return null

  return payload as AccountProjectRepairTokenPayload
}
