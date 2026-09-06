import { prisma } from "@/lib/prisma"
import type { Prisma } from "@/generated/prisma/client"
import { ApiRequestError } from "@/lib/api-contract"

export type AccountProjectContextStatus =
  | "bound"
  | "setup_required"
  | "admin_review_required"

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

export type AccountProjectContextErrorCode =
  | "ACCOUNT_NOT_FOUND"
  | "ACCOUNT_PROJECT_SETUP_REQUIRED"
  | "ACCOUNT_PROJECT_REVIEW_REQUIRED"
  | "ACCOUNT_ALREADY_BOUND"
  | "PROJECT_CONTEXT_MISMATCH"
  | "BOUND_PROJECT_UNAVAILABLE"

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

  const projectCount = await prisma.clientProject.count({
    where: { userId },
  })

  if (projectCount === 0) return { status: "setup_required" }

  return { status: "admin_review_required", projectCount }
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
    try {
      boundProjectId = await getUserBinding(input.userId)
    } catch {
      boundProjectId = null
    }
  }
  // eslint-disable-next-line no-console
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

    const projectCount = await tx.clientProject.count({ where: { userId } })
    if (projectCount > 0) {
      throw new AccountProjectContextError(
        "ACCOUNT_PROJECT_REVIEW_REQUIRED",
        "账号存在未绑定项目，请联系管理员完成绑定",
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
