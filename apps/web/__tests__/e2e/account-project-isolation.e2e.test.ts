import { createHash, randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "./helpers"
import { adminToken, cleanDatabase, cleanRedis, createAdminUser, json, req, signUserAuthToken } from "./helpers"
import {
  ACCOUNT_PROJECT_CONTEXT_STALE,
  createInitialAccountProject,
  getAccountProjectContext,
} from "@/lib/account-project-context"
import { cancelStaleProjectBackgroundTask } from "@/lib/background-tasks"
import { buildRawInputWithMarketViralContext, buildRawInputWithVideoCopyContext } from "@/lib/aim-generate-context"
import { executeRemoteInvocationBackgroundTask } from "@/lib/aim/services/remote-invocation-task"
import { GET as HISTORY_GET } from "@/app/api/aim/history/route"
import { GET as HISTORY_DETAIL_GET } from "@/app/api/aim/history/[id]/route"
import { POST as GENERATE_POST } from "@/app/api/aim/generate/route"
import { POST as REPAIR_POST } from "@/app/api/admin/account-project-bindings/[userId]/repair/route"
import { GET as REPAIR_PREVIEW_GET } from "@/app/api/admin/account-project-bindings/[userId]/preview/route"
import { POST as REPAIR_PREVIEW_POST } from "@/app/api/admin/account-project-bindings/[userId]/preview/route"

// ─────────────────────────────────────────────────────────────────────────────
// Model-execution gate spy
//
// Scenarios 2 and 4 must prove the request is rejected BEFORE any model call.
// The whole suite runs with the real account-project code + real isolated DB,
// but the harness runtime boundary is stubbed so a regression that reaches the
// executor surfaces as a called spy instead of a live (key-less) model attempt.
// ─────────────────────────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  executeAimRun: vi.fn(async () => {
    throw new Error("executeAimRun must NOT run in account-project-isolation e2e")
  }),
  streamAimRun: vi.fn(async () => {
    throw new Error("streamAimRun must NOT run in account-project-isolation e2e")
  }),
  normalizeAimAgentId: vi.fn((agentId: string) => agentId),
  isValidAimAgent: vi.fn(() => true),
  prepareAimContext: vi.fn(async () => {
    throw new Error("prepareAimContext must NOT run in account-project-isolation e2e")
  }),
}))

vi.mock("@/lib/aim-harness/runtime", () => ({
  executeAimRun: mocks.executeAimRun,
  streamAimRun: mocks.streamAimRun,
  normalizeAimAgentId: mocks.normalizeAimAgentId,
  isValidAimAgent: mocks.isValidAimAgent,
  prepareAimContext: mocks.prepareAimContext,
}))

// ─────────────────────────────────────────────────────────────────────────────
// Fixture identifiers (all within the isolated test DB)
// ─────────────────────────────────────────────────────────────────────────────
const USER_A = { id: "iso-user-a", email: "iso-a@test.com" }
const USER_B = { id: "iso-user-b", email: "iso-b@test.com" }
const USER_RECOVERY = { id: "iso-user-recovery", email: "iso-recovery@test.com" }

const PROJECT_OLD = "iso-project-old" // A 的旧项目（不再绑定）
const PROJECT_BOUND = "iso-project-bound" // A 当前绑定
const PROJECT_B_USER = "iso-project-b-user" // B 的绑定项目
const RECOVERY_PROJECT_1 = "iso-rec-proj-1" // A → 仅停用/归档账号
const RECOVERY_PROJECT_2 = "iso-rec-proj-2"

const GEN_BOUND = "iso-gen-bound"
const GEN_OLD = "iso-gen-old"
const GEN_NULL = "iso-gen-null"

const WATCH_MARKER_BOUND = "MARKER_BOUND_ONLY"
const WATCH_MARKER_OLD = "MARKER_OLD_PROJECT_LEAK"
const WATCH_MARKER_NULL = "MARKER_NULL_PROJECT_LEAK"
const WATCH_MARKER_USER_B = "MARKER_USER_B_LEAK"
const VCE_TRANSCRIPT_BOUND = "VCE_TRANSCRIPT_BOUND_ONLY"
const VCE_TRANSCRIPT_OLD = "VCE_TRANSCRIPT_OLD_LEAK"
const VCE_TRANSCRIPT_NULL = "VCE_TRANSCRIPT_NULL_LEAK"

const REPAIR_REASON = "e2e: 用户 A 绑定指向旧项目，需改绑到当前项目"

let admin: { id: string; email: string; role: string }
const createdBackgroundTaskIds: string[] = []
const createdInvocationIds: string[] = []
const createdApiKeyIds: string[] = []

async function seedBaseFixture() {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await prisma.user.create({
    data: { id: USER_A.id, email: USER_A.email, password: "hashed", name: "User A", plan: "pro", expiresAt: future },
  })
  await prisma.user.create({
    data: { id: USER_B.id, email: USER_B.email, password: "hashed", name: "User B", plan: "pro", expiresAt: future },
  })

  await prisma.clientProject.create({
    data: { id: PROJECT_OLD, userId: USER_A.id, name: "旧项目（A）", status: "active" },
  })
  await prisma.clientProject.create({
    data: { id: PROJECT_BOUND, userId: USER_A.id, name: "绑定项目（A）", status: "active" },
  })
  await prisma.clientProject.create({
    data: { id: PROJECT_B_USER, userId: USER_B.id, name: "绑定项目（B）", status: "active" },
  })

  await prisma.user.update({ where: { id: USER_A.id }, data: { boundProjectId: PROJECT_BOUND } })
  await prisma.user.update({ where: { id: USER_B.id }, data: { boundProjectId: PROJECT_B_USER } })

  await seedAimGenerationRows()
  await seedContextRows()
}

async function seedAimGenerationRows() {
  await prisma.aimGeneration.create({
    data: {
      id: GEN_BOUND,
      userId: USER_A.id,
      projectId: PROJECT_BOUND,
      agentId: "content_producer",
      rawInput: "bound generation",
    },
  })
  await prisma.aimGeneration.create({
    data: {
      id: GEN_OLD,
      userId: USER_A.id,
      projectId: PROJECT_OLD,
      agentId: "content_producer",
      rawInput: "old generation",
      taskSpec: { goal: "旧项目母稿", knownFacts: [], unknowns: [], assumptions: [] } as Prisma.InputJsonValue,
    },
  })
  await prisma.aimGeneration.create({
    data: {
      id: GEN_NULL,
      userId: USER_A.id,
      projectId: null,
      agentId: "content_producer",
      rawInput: "unbound (null project) generation",
    },
  })
}

async function seedContextRows() {
  // 对标账号（market viral context）：绑定 / 旧项目 / null / 其他用户
  await prisma.watchAccount.create({
    data: {
      id: "iso-watch-bound",
      userId: USER_A.id,
      projectId: PROJECT_BOUND,
      targetUrl: "https://example.com/bound",
      platform: "douyin",
      viralVideos: [{ title: WATCH_MARKER_BOUND, videoUrl: "https://example.com/v/1" }] as Prisma.InputJsonValue,
    },
  })
  await prisma.watchAccount.create({
    data: {
      id: "iso-watch-old",
      userId: USER_A.id,
      projectId: PROJECT_OLD,
      targetUrl: "https://example.com/old",
      platform: "douyin",
      viralVideos: [{ title: WATCH_MARKER_OLD, videoUrl: "https://example.com/v/2" }] as Prisma.InputJsonValue,
    },
  })
  await prisma.watchAccount.create({
    data: {
      id: "iso-watch-null",
      userId: USER_A.id,
      projectId: null,
      targetUrl: "https://example.com/null",
      platform: "douyin",
      viralVideos: [{ title: WATCH_MARKER_NULL, videoUrl: "https://example.com/v/3" }] as Prisma.InputJsonValue,
    },
  })
  await prisma.watchAccount.create({
    data: {
      id: "iso-watch-user-b",
      userId: USER_B.id,
      projectId: PROJECT_B_USER,
      targetUrl: "https://example.com/user-b",
      platform: "douyin",
      viralVideos: [{ title: WATCH_MARKER_USER_B, videoUrl: "https://example.com/v/4" }] as Prisma.InputJsonValue,
    },
  })

  // 视频文案拆解（video copy context）：绑定 / 旧项目 / null
  await prisma.videoCopyExtraction.create({
    data: {
      id: "iso-vce-bound",
      userId: USER_A.id,
      projectId: PROJECT_BOUND,
      sourceUrl: "https://example.com/vce/bound",
      platform: "douyin",
      transcript: VCE_TRANSCRIPT_BOUND,
    },
  })
  await prisma.videoCopyExtraction.create({
    data: {
      id: "iso-vce-old",
      userId: USER_A.id,
      projectId: PROJECT_OLD,
      sourceUrl: "https://example.com/vce/old",
      platform: "douyin",
      transcript: VCE_TRANSCRIPT_OLD,
    },
  })
  await prisma.videoCopyExtraction.create({
    data: {
      id: "iso-vce-null",
      userId: USER_A.id,
      projectId: null,
      sourceUrl: "https://example.com/vce/null",
      platform: "douyin",
      transcript: VCE_TRANSCRIPT_NULL,
    },
  })
}

async function seedApiKeyForUser(userId: string): Promise<string> {
  const keyHash = createHash("sha256").update(randomUUID()).digest("hex")
  const created = await prisma.agentApiKey.create({
    data: {
      id: `iso-apikey-${randomUUID().slice(0, 8)}`,
      userId,
      name: "e2e isolation key",
      keyPrefix: "iso_e2e",
      keyHash,
      status: "active",
    },
  })
  createdApiKeyIds.push(created.id)
  return created.id
}

/** Queue a stale old-project AgentInvocation + its single-attempt BackgroundTask. */
async function seedOldProjectInvocation(userId: string, projectId: string): Promise<string> {
  const apiKeyId = await seedApiKeyForUser(userId)
  const invocationId = `iso-inv-${randomUUID().slice(0, 8)}`
  const requestHash = createHash("sha256").update(invocationId).digest("hex")
  const invocation = await prisma.agentInvocation.create({
    data: {
      id: invocationId,
      apiKeyId,
      userId,
      projectId,
      agentId: "content_producer",
      action: "draft.generate",
      idempotencyKey: `e2e-iso-${invocationId}`,
      requestHash,
      rawInput: "旧项目下的远程生成任务",
      targetFormats: ["video_script"] as Prisma.InputJsonValue,
      status: "queued",
    },
  })
  createdInvocationIds.push(invocation.id)
  const task = await prisma.backgroundTask.create({
    data: {
      kind: "agent.remote.generate",
      aggregateType: "agent_invocation",
      aggregateId: invocation.id,
      idempotencyKey: `agent-remote-gen:${invocation.id}`,
      maxAttempts: 1,
    },
  })
  createdBackgroundTaskIds.push(task.id)
  await prisma.agentInvocation.update({
    where: { id: invocation.id },
    data: { backgroundTaskId: task.id },
  })
  return task.id
}

async function cleanupTestArtifacts() {
  await prisma.agentInvocation.deleteMany({ where: { id: { in: createdInvocationIds } } })
  await prisma.backgroundTask.deleteMany({ where: { id: { in: createdBackgroundTaskIds } } })
  await prisma.agentApiKey.deleteMany({ where: { id: { in: createdApiKeyIds } } })
  await cleanDatabase()
}

function userAuthHeaders(user: { id: string; email: string }): Record<string, string> {
  return { Authorization: `Bearer ${signUserAuthToken(user)}` }
}

function adminAuthHeaders(requestId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${adminToken(admin)}`,
    ...(requestId ? { "x-request-id": requestId } : {}),
  }
}

describe("account-project-isolation e2e (isolated DB)", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    await seedBaseFixture()
    const adminRow = await createAdminUser()
    admin = { id: adminRow.id, email: adminRow.email, role: adminRow.role }
  })

  afterAll(async () => {
    expect(mocks.executeAimRun).not.toHaveBeenCalled()
    await cleanupTestArtifacts()
    await prisma.$disconnect()
  })

  it("scenario 1: 请求旧项目被拒绝（列表 PROJECT_CONTEXT_MISMATCH，旧稿详情 404）", async () => {
    // A 绑定 PROJECT_BOUND；请求历史列表携带旧项目 id → 409 PROJECT_CONTEXT_MISMATCH
    const oldProjectRes = await HISTORY_GET(
      req(`/api/aim/history?projectId=${PROJECT_OLD}`, { headers: userAuthHeaders(USER_A) }),
    )
    expect(oldProjectRes.status).toBe(409)
    const oldProjectBody = await json(oldProjectRes)
    expect(oldProjectBody.code).toBe("PROJECT_CONTEXT_MISMATCH")

    // 请求其他账号（B）的项目同样被拒
    const userBProjectRes = await HISTORY_GET(
      req(`/api/aim/history?projectId=${PROJECT_B_USER}`, { headers: userAuthHeaders(USER_A) }),
    )
    expect(userBProjectRes.status).toBe(409)

    // 正常列表只返回绑定项目记录，绝不返回旧项目 / null 历史
    const boundRes = await HISTORY_GET(
      req(`/api/aim/history?projectId=${PROJECT_BOUND}`, { headers: userAuthHeaders(USER_A) }),
    )
    expect(boundRes.status).toBe(200)
    const boundList = (await json(boundRes)) as Array<{ id: string }>
    const boundIds = boundList.map((row) => row.id)
    expect(boundIds).toContain(GEN_BOUND)
    expect(boundIds).not.toContain(GEN_OLD)
    expect(boundIds).not.toContain(GEN_NULL)

    // 直接请求旧项目下的某条生成详情 → 404（不泄露）
    const oldDetail = await HISTORY_DETAIL_GET(
      req(`/api/aim/history/${GEN_OLD}`, { headers: userAuthHeaders(USER_A) }),
      { params: Promise.resolve({ id: GEN_OLD }) },
    )
    expect(oldDetail.status).toBe(404)

    // null 历史详情同样 404；绑定项目详情 200（正例）
    const nullDetail = await HISTORY_DETAIL_GET(
      req(`/api/aim/history/${GEN_NULL}`, { headers: userAuthHeaders(USER_A) }),
      { params: Promise.resolve({ id: GEN_NULL }) },
    )
    expect(nullDetail.status).toBe(404)

    const boundDetail = await HISTORY_DETAIL_GET(
      req(`/api/aim/history/${GEN_BOUND}`, { headers: userAuthHeaders(USER_A) }),
      { params: Promise.resolve({ id: GEN_BOUND }) },
    )
    expect(boundDetail.status).toBe(200)
  })

  it("scenario 2: 引用旧项目 Generation 被拒绝（EXISTING_GENERATION_NOT_IN_BOUND_PROJECT）且无模型调用", async () => {
    const res = await GENERATE_POST(
      req("/api/aim/generate", {
        method: "POST",
        headers: userAuthHeaders(USER_A),
        body: {
          agentId: "content_producer",
          rawInput: "请基于我的旧稿写一条新的产品文案",
          targetFormats: ["video_script"],
          projectId: PROJECT_BOUND,
          existingGenerationId: GEN_OLD, // 属于 A 但挂在旧项目 PROJECT_OLD 下
        },
      }),
    )
    expect(res.status).toBe(404)
    const body = await json(res)
    expect(body.code).toBe("EXISTING_GENERATION_NOT_IN_BOUND_PROJECT")
    // 拒绝必须发生在模型执行之前
    expect(mocks.executeAimRun).not.toHaveBeenCalled()
  })

  it("scenario 3: 生成上下文只含绑定项目历史，排除旧项目与 null 历史", async () => {
    // market viral context（真实 builder + 真实 DB；projectId 未传 → 服务端按绑定项目解析）
    const marketContext = await buildRawInputWithMarketViralContext(USER_A.id, "RAW", true)
    expect(marketContext).toContain(WATCH_MARKER_BOUND)
    expect(marketContext).not.toContain(WATCH_MARKER_OLD)
    expect(marketContext).not.toContain(WATCH_MARKER_NULL)
    expect(marketContext).not.toContain(WATCH_MARKER_USER_B)

    // video copy context：引用旧项目 / null 拆解 → 不得注入
    const oldVce = await buildRawInputWithVideoCopyContext(USER_A.id, "S", "iso-vce-old")
    expect(oldVce).toBe("S")
    const nullVce = await buildRawInputWithVideoCopyContext(USER_A.id, "S", "iso-vce-null")
    expect(nullVce).toBe("S")

    // 绑定项目拆解 → 正常注入（正例，防止“一刀切全不注入”假通过）
    const boundVce = await buildRawInputWithVideoCopyContext(USER_A.id, "S", "iso-vce-bound")
    expect(boundVce).toContain(VCE_TRANSCRIPT_BOUND)
  })

  it("scenario 4: 旧 AgentInvocation/BackgroundTask 在执行时被隔离（ACCOUNT_PROJECT_CONTEXT_STALE），无模型执行", async () => {
    // A 已绑定 PROJECT_BOUND；构造绑定变更前排队在旧项目下的远程任务
    const taskId = await seedOldProjectInvocation(USER_A.id, PROJECT_OLD)
    const invocationRow = await prisma.agentInvocation.findFirstOrThrow({
      where: { backgroundTaskId: taskId },
    })

    const executed = await executeRemoteInvocationBackgroundTask(taskId)
    expect(executed).toBe(true)

    const invocationAfter = await prisma.agentInvocation.findUniqueOrThrow({
      where: { id: invocationRow.id },
    })
    expect(invocationAfter.status).toBe("failed")
    expect(invocationAfter.errorCode).toBe(ACCOUNT_PROJECT_CONTEXT_STALE)

    const taskAfter = await prisma.backgroundTask.findUniqueOrThrow({ where: { id: taskId } })
    expect(taskAfter.status).toBe("failed") // maxAttempts=1、不可重试
    expect(taskAfter.lastError).toContain(ACCOUNT_PROJECT_CONTEXT_STALE)

    expect(mocks.executeAimRun).not.toHaveBeenCalled()
  })

  it("scenario 5: inactive-only 账号进入恢复状态，自助创建不进入死循环", async () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    await prisma.user.create({
      data: {
        id: USER_RECOVERY.id,
        email: USER_RECOVERY.email,
        password: "hashed",
        name: "Recovery User",
        plan: "pro",
        expiresAt: future,
      },
    })
    await prisma.clientProject.create({
      data: { id: RECOVERY_PROJECT_1, userId: USER_RECOVERY.id, name: "停用项目1", status: "paused" },
    })
    await prisma.clientProject.create({
      data: { id: RECOVERY_PROJECT_2, userId: USER_RECOVERY.id, name: "归档项目2", status: "archived" },
    })

    const context = await getAccountProjectContext(USER_RECOVERY.id)
    expect(context.status).toBe("inactive_project_recovery_required")
    if (context.status === "inactive_project_recovery_required") {
      expect(context.projectCount).toBe(2)
    }

    // 仅停用/归档项目账号不能自助创建第一个项目 → 拒绝且不新增项目（无死循环）
    await expect(
      createInitialAccountProject(USER_RECOVERY.id, { name: "不应创建" }),
    ).rejects.toMatchObject({ code: "ACCOUNT_PROJECT_RECOVERY_REQUIRED" })

    const projectCount = await prisma.clientProject.count({ where: { userId: USER_RECOVERY.id } })
    expect(projectCount).toBe(2)
  })

  it("scenario 6: 管理员修复 A 旧→新：旧任务取消、审计完整（prev/next/reason/requestId）", async () => {
    // 回卷：把 A 的绑定临时设到旧项目，制造“需要修复”的状态
    await prisma.user.update({ where: { id: USER_A.id }, data: { boundProjectId: PROJECT_OLD } })
    const taskId = await seedOldProjectInvocation(USER_A.id, PROJECT_OLD)
    const invocationRow = await prisma.agentInvocation.findFirstOrThrow({
      where: { backgroundTaskId: taskId },
    })

    const requestId = `iso-req-${randomUUID()}`
    const adminHeaders = adminAuthHeaders(requestId)

    const previewGetRes = await REPAIR_PREVIEW_GET(
      req(`/api/admin/account-project-bindings/${USER_A.id}/preview?projectId=${PROJECT_BOUND}`, {
        headers: adminHeaders,
      }),
      { params: Promise.resolve({ userId: USER_A.id }) },
    )
    expect(previewGetRes.status).toBe(200)
    const previewBody = await json(previewGetRes)
    expect(previewBody.impact.currentBinding.id).toBe(PROJECT_OLD)
    expect(previewBody.impact.targetProject.id).toBe(PROJECT_BOUND)
    expect(previewBody.impact.wouldCancel.agentInvocations).toBeGreaterThanOrEqual(1)
    expect(previewBody.impact.wouldCancel.backgroundTasks).toBeGreaterThanOrEqual(1)

    // 二次确认 token（真实 HMAC，绑定 reason）
    const mintRes = await REPAIR_PREVIEW_POST(
      req(`/api/admin/account-project-bindings/${USER_A.id}/preview`, {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: { projectId: PROJECT_BOUND, reason: REPAIR_REASON, reactivate: false },
      }),
      { params: Promise.resolve({ userId: USER_A.id }) },
    )
    expect(mintRes.status).toBe(200)
    const mintBody = await json(mintRes)
    expect(typeof mintBody.token).toBe("string")

    const repairRes = await REPAIR_POST(
      req(`/api/admin/account-project-bindings/${USER_A.id}/repair`, {
        method: "POST",
        headers: { ...adminHeaders, "Content-Type": "application/json" },
        body: { token: mintBody.token, reason: REPAIR_REASON },
      }),
      { params: Promise.resolve({ userId: USER_A.id }) },
    )
    expect(repairRes.status).toBe(200)
    const repairBody = await json(repairRes)
    expect(repairBody.data.previousProjectId).toBe(PROJECT_OLD)
    expect(repairBody.data.nextProjectId).toBe(PROJECT_BOUND)
    expect(repairBody.data.cancelledTaskCount).toBeGreaterThanOrEqual(1)
    expect(repairBody.data.failedInvocationCount).toBeGreaterThanOrEqual(1)
    expect(repairRes.headers.get("x-request-id")).toBe(requestId)

    // 旧任务被取消/失败，均带稳定原因
    const invocationAfter = await prisma.agentInvocation.findUniqueOrThrow({ where: { id: invocationRow.id } })
    expect(invocationAfter.status).toBe("failed")
    expect(invocationAfter.errorCode).toBe(ACCOUNT_PROJECT_CONTEXT_STALE)
    const taskAfter = await prisma.backgroundTask.findUniqueOrThrow({ where: { id: taskId } })
    expect(taskAfter.status).toBe("cancelled")
    expect(taskAfter.lastError).toBe(ACCOUNT_PROJECT_CONTEXT_STALE)

    // 审计完整
    const audit = await prisma.adminAuditLog.findFirst({
      where: { adminId: admin.id, action: "account_project.repair", targetId: USER_A.id },
      orderBy: { createdAt: "desc" },
    })
    expect(audit).not.toBeNull()
    expect(audit!.requestId).toBe(requestId)
    const metadata = (audit!.metadata ?? {}) as Record<string, unknown>
    expect(metadata.previousProjectId).toBe(PROJECT_OLD)
    expect(metadata.nextProjectId).toBe(PROJECT_BOUND)
    expect(metadata.reason).toBe(REPAIR_REASON)
    expect(metadata.failedInvocationCount).toBeGreaterThanOrEqual(1)
    expect(metadata.cancelledTaskCount).toBeGreaterThanOrEqual(1)

    // 绑定已切回新项目（与基础夹具一致），且旧项目上不再有排队任务
    const userAfter = await prisma.user.findUniqueOrThrow({ where: { id: USER_A.id } })
    expect(userAfter.boundProjectId).toBe(PROJECT_BOUND)
    expect(mocks.executeAimRun).not.toHaveBeenCalled()
  })

  it("scenario 6b: 已完成任务不会被旧项目取消逻辑改写", async () => {
    const doneTask = await prisma.backgroundTask.create({
      data: {
        kind: "agent.remote.generate",
        aggregateType: "agent_invocation",
        aggregateId: `no-such-invocation-${randomUUID()}`,
        idempotencyKey: `e2e-iso-succeeded-${randomUUID()}`,
        status: "succeeded",
        completedAt: new Date(),
      },
    })
    createdBackgroundTaskIds.push(doneTask.id)

    const updated = await cancelStaleProjectBackgroundTask(prisma, doneTask.id, new Date())
    expect(updated).toBe(0)

    const stored = await prisma.backgroundTask.findUniqueOrThrow({ where: { id: doneTask.id } })
    expect(stored.status).toBe("succeeded")
  })
})
