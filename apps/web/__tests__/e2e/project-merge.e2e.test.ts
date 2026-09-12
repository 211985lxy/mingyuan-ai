import { createHash } from "node:crypto"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import type { Prisma } from "@/generated/prisma/client"
import {
  cleanDatabase,
  createAdminUser,
  disconnectAll,
  prisma,
} from "./helpers"
import { applyProjectMerge } from "@/features/projects/services/project-merge-service"
import { prismaProjectMergeStore } from "@/features/projects/services/project-merge-prisma-store"

const SOURCE_ID = "merge-e2e-source"
const TARGET_ID = "merge-e2e-target"
const THIRD_ID = "merge-e2e-third"

const SOURCE_OWNER = "merge-e2e-source-owner"
const SOURCE_MEMBER = "merge-e2e-source-member"
const TARGET_OWNER = "merge-e2e-target-owner"
const TARGET_MEMBER = "merge-e2e-target-member"
const THIRD_BOUND = "merge-e2e-third-bound"

const GEN_ID = "merge-e2e-gen-1"
const STRUCTURE_ID = "merge-e2e-vs-1"
const TRACE_ID = "merge-e2e-trace-1"
const SNAPSHOT_ID = "merge-e2e-snap-1"
const AUDIT_EVENT_ID = "merge-e2e-audit-event-1"
const TARGET_KEY_ID = "merge-e2e-key-target"
const SOURCE_KEY_ID = "merge-e2e-key-source"
const INVOCATION_ID = "merge-e2e-inv-1"

const REQUEST_ID = "merge-e2e-req-1"
const MERGE_REASON = "e2e consolidate duplicate workspace"

const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

function fingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

async function cleanupMergeFixtures() {
  await prisma.agentInvocation.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await prisma.agentApiKey.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await prisma.aimExecutionTrace.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await prisma.aimRunSnapshot.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await prisma.auditEvent.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await prisma.videoStructure.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await prisma.aimGeneration.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await prisma.projectMember.deleteMany({ where: { projectId: { startsWith: "merge-e2e-" } } })
  await prisma.user.updateMany({
    where: { id: { startsWith: "merge-e2e-" } },
    data: { boundProjectId: null },
  })
  await prisma.clientProject.deleteMany({ where: { id: { startsWith: "merge-e2e-" } } })
  await cleanDatabase()
}

async function createUser(id: string, name: string) {
  return prisma.user.create({
    data: {
      id,
      email: `${id}@test.com`,
      password: "hashed",
      name,
      plan: "pro",
      expiresAt: future,
    },
  })
}

async function createProject(id: string, ownerId: string, name: string) {
  return prisma.clientProject.create({
    data: { id, userId: ownerId, name, status: "active" },
  })
}

async function bindUser(userId: string, projectId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      boundProjectId: projectId,
      projectBoundAt: new Date(),
      projectBindingSource: "admin_review",
    },
  })
}

async function addMember(projectId: string, userId: string, role: "owner" | "member") {
  return prisma.projectMember.create({
    data: { projectId, userId, role },
  })
}

async function seedAccountsAndProjects(options?: { includeThird?: boolean }) {
  const admin = await createAdminUser({
    email: "merge-e2e-admin@test.com",
    name: "Merge E2E Admin",
    role: "admin",
    isActive: true,
  })

  await createUser(SOURCE_OWNER, "Source Owner")
  await createUser(SOURCE_MEMBER, "Source Member")
  await createUser(TARGET_OWNER, "Target Owner")
  await createUser(TARGET_MEMBER, "Target Member")

  await createProject(SOURCE_ID, SOURCE_OWNER, "merge-e2e-source")
  await createProject(TARGET_ID, TARGET_OWNER, "merge-e2e-target")

  await addMember(SOURCE_ID, SOURCE_OWNER, "owner")
  await addMember(SOURCE_ID, SOURCE_MEMBER, "member")
  await addMember(TARGET_ID, TARGET_OWNER, "owner")
  await addMember(TARGET_ID, TARGET_MEMBER, "member")

  await bindUser(SOURCE_OWNER, SOURCE_ID)
  await bindUser(SOURCE_MEMBER, SOURCE_ID)
  await bindUser(TARGET_OWNER, TARGET_ID)
  await bindUser(TARGET_MEMBER, TARGET_ID)

  if (options?.includeThird) {
    await createUser(THIRD_BOUND, "Third Bound")
    await createProject(THIRD_ID, THIRD_BOUND, "merge-e2e-third")
    await addMember(THIRD_ID, THIRD_BOUND, "owner")
    await addMember(SOURCE_ID, THIRD_BOUND, "member")
    await bindUser(THIRD_BOUND, THIRD_ID)
  }

  return admin
}

async function seedHappyPathContent() {
  await prisma.aimGeneration.create({
    data: {
      id: GEN_ID,
      userId: SOURCE_OWNER,
      projectId: SOURCE_ID,
      agentId: "content_producer",
      rawInput: "merge-e2e-input",
    },
  })
  await prisma.videoStructure.create({
    data: {
      id: STRUCTURE_ID,
      name: "merge-e2e-vs-source",
      displayName: "merge-e2e-structure",
      blueprint: { openingPattern: "e2e" } as Prisma.InputJsonValue,
      origin: "extracted",
      userId: SOURCE_OWNER,
      projectId: SOURCE_ID,
    },
  })
  await prisma.aimExecutionTrace.create({
    data: {
      id: TRACE_ID,
      userId: SOURCE_OWNER,
      projectId: SOURCE_ID,
      agentId: "content_producer",
      action: "generate",
      status: "success",
    },
  })
  await prisma.aimRunSnapshot.create({
    data: {
      id: SNAPSHOT_ID,
      runId: "merge-e2e-run-1",
      userId: SOURCE_OWNER,
      projectId: SOURCE_ID,
      expiresAt: future,
    },
  })
  await prisma.auditEvent.create({
    data: {
      id: AUDIT_EVENT_ID,
      occurredAt: new Date(),
      source: "e2e",
      category: "operation",
      severity: "info",
      status: "success",
      action: "merge-e2e.seed",
      summary: "merge-e2e retained audit",
      projectId: SOURCE_ID,
      idempotencyKey: "merge-e2e-audit-event-1",
      payloadHash: fingerprint("merge-e2e-audit-event-1"),
    },
  })
  await prisma.agentApiKey.create({
    data: {
      id: TARGET_KEY_ID,
      userId: TARGET_OWNER,
      name: "merge-e2e-target-key",
      keyPrefix: "mge2e_",
      keyHash: fingerprint(`merge-e2e-target-key-${TARGET_KEY_ID}`),
      allowedProjects: [SOURCE_ID, TARGET_ID] as Prisma.InputJsonValue,
    },
  })
}

async function seedActiveSourceInvocation() {
  await prisma.agentApiKey.create({
    data: {
      id: SOURCE_KEY_ID,
      userId: SOURCE_OWNER,
      name: "merge-e2e-source-key",
      keyPrefix: "mge2e_",
      keyHash: fingerprint(`merge-e2e-source-key-${SOURCE_KEY_ID}`),
      allowedProjects: [SOURCE_ID] as Prisma.InputJsonValue,
    },
  })
  await prisma.agentInvocation.create({
    data: {
      id: INVOCATION_ID,
      apiKeyId: SOURCE_KEY_ID,
      userId: SOURCE_OWNER,
      projectId: SOURCE_ID,
      agentId: "content_producer",
      idempotencyKey: "merge-e2e-inv-1",
      requestHash: fingerprint("merge-e2e-inv-1"),
      rawInput: "merge-e2e-active",
      status: "queued",
    },
  })
}

function mergeInput(adminUserId: string) {
  return {
    sourceProjectId: SOURCE_ID,
    targetProjectId: TARGET_ID,
    adminUserId,
    expectedSourceOwnerId: SOURCE_OWNER,
    expectedTargetOwnerId: TARGET_OWNER,
    requestId: REQUEST_ID,
    confirmation: `${SOURCE_ID}->${TARGET_ID}`,
    reason: MERGE_REASON,
  }
}

async function snapshotMergeState() {
  // Intentionally excludes AdminAuditLog: rejected merges write one failure audit
  // outside the rolled-back transaction, and these tests assert it separately.
  return {
    users: await prisma.user.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, boundProjectId: true, projectBindingSource: true },
      orderBy: { id: "asc" },
    }),
    projects: await prisma.clientProject.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, userId: true, status: true },
      orderBy: { id: "asc" },
    }),
    members: await prisma.projectMember.findMany({
      where: { projectId: { startsWith: "merge-e2e-" } },
      select: { projectId: true, userId: true, role: true },
      orderBy: [{ projectId: "asc" }, { userId: "asc" }],
    }),
    generations: await prisma.aimGeneration.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, projectId: true },
      orderBy: { id: "asc" },
    }),
    structures: await prisma.videoStructure.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, projectId: true },
      orderBy: { id: "asc" },
    }),
    traces: await prisma.aimExecutionTrace.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, projectId: true, status: true },
      orderBy: { id: "asc" },
    }),
    snapshots: await prisma.aimRunSnapshot.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, projectId: true },
      orderBy: { id: "asc" },
    }),
    auditEvents: await prisma.auditEvent.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, projectId: true },
      orderBy: { id: "asc" },
    }),
    keys: await prisma.agentApiKey.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, allowedProjects: true },
      orderBy: { id: "asc" },
    }),
    invocations: await prisma.agentInvocation.findMany({
      where: { id: { startsWith: "merge-e2e-" } },
      select: { id: true, projectId: true, status: true },
      orderBy: { id: "asc" },
    }),
  }
}

async function expectSingleFailedMergeAudit(adminId: string, reasonPattern: RegExp) {
  const audits = await prisma.adminAuditLog.findMany({
    where: {
      action: "account.project_merge",
      targetId: TARGET_ID,
      requestId: REQUEST_ID,
      status: "failed",
    },
    orderBy: { createdAt: "asc" },
  })
  expect(audits).toHaveLength(1)
  const audit = audits[0]!
  expect(audit.adminId).toBe(adminId)
  expect(audit.targetType).toBe("ClientProject")
  expect(audit.severity).toBe("warning")
  expect(audit.correlationId).toBe(REQUEST_ID)
  const metadata = (audit.metadata ?? {}) as Record<string, unknown>
  expect(metadata.source).toBe(SOURCE_ID)
  expect(metadata.target).toBe(TARGET_ID)
  expect(metadata.reason).toEqual(expect.stringMatching(reasonPattern))
}

describe("project merge e2e", () => {
  beforeEach(async () => {
    await cleanupMergeFixtures()
  })

  afterAll(async () => {
    await cleanupMergeFixtures()
    await disconnectAll()
  })

  it("moves source content onto the target, keeps retain rows, and writes a success audit", async () => {
    const admin = await seedAccountsAndProjects()
    await seedHappyPathContent()

    const result = await applyProjectMerge(mergeInput(admin.id), prismaProjectMergeStore)

    expect(await prisma.aimGeneration.count({ where: { projectId: SOURCE_ID } })).toBe(0)
    expect(await prisma.videoStructure.count({ where: { projectId: SOURCE_ID } })).toBe(0)
    expect(await prisma.aimExecutionTrace.count({ where: { projectId: SOURCE_ID } })).toBe(0)
    expect(await prisma.auditEvent.count({ where: { projectId: SOURCE_ID } })).toBe(1)
    expect(await prisma.projectMember.count({ where: { projectId: SOURCE_ID } })).toBeGreaterThan(0)
    expect(await prisma.adminAuditLog.count({
      where: { action: "account.project_merge", targetId: TARGET_ID, status: "success" },
    })).toBe(1)

    expect(await prisma.aimGeneration.count({ where: { projectId: TARGET_ID } })).toBe(1)
    expect(await prisma.videoStructure.count({ where: { projectId: TARGET_ID } })).toBe(1)
    expect(await prisma.aimExecutionTrace.count({ where: { projectId: TARGET_ID } })).toBe(1)
    expect(await prisma.aimRunSnapshot.count({ where: { projectId: TARGET_ID } })).toBe(1)
    expect(result.moveCounts.AimGeneration).toBe(1)
    expect(result.moveCounts.VideoStructure).toBe(1)
    expect(result.moveCounts.AimExecutionTrace).toBe(1)
    expect(result.moveCounts.AimRunSnapshot).toBe(1)
    expect(result.movedRows).toBe(4)

    const source = await prisma.clientProject.findUniqueOrThrow({ where: { id: SOURCE_ID } })
    expect(source.status).toBe("archived")

    const rebound = await prisma.user.findMany({
      where: { id: { in: [SOURCE_OWNER, SOURCE_MEMBER] } },
      select: { boundProjectId: true },
    })
    expect(rebound.every((row) => row.boundProjectId === TARGET_ID)).toBe(true)

    const key = await prisma.agentApiKey.findUniqueOrThrow({
      where: { id: TARGET_KEY_ID },
      select: { allowedProjects: true },
    })
    expect(key.allowedProjects).toEqual([TARGET_ID])

    const audit = await prisma.adminAuditLog.findFirstOrThrow({
      where: { action: "account.project_merge", targetId: TARGET_ID, status: "success" },
    })
    expect(audit.adminId).toBe(admin.id)
    expect(audit.targetType).toBe("ClientProject")
    expect(audit.severity).toBe("warning")
    expect(audit.requestId).toBe(REQUEST_ID)
    expect(audit.correlationId).toBe(REQUEST_ID)
    const metadata = (audit.metadata ?? {}) as Record<string, unknown>
    expect(metadata.source).toBe(SOURCE_ID)
    expect(metadata.target).toBe(TARGET_ID)
    expect(metadata.reason).toBe(MERGE_REASON)
    expect(metadata.participantCount).toBe(4)
    expect(metadata.remappedApiKeys).toBe(1)
    expect(metadata.movedRows).toBe(4)
    expect(metadata.moveCounts).toMatchObject({
      AimGeneration: 1,
      VideoStructure: 1,
      AimExecutionTrace: 1,
      AimRunSnapshot: 1,
    })
  })

  it("rolls back a third-project conflict with zero committed writes", async () => {
    const admin = await seedAccountsAndProjects({ includeThird: true })
    await seedHappyPathContent()
    const before = await snapshotMergeState()

    await expect(applyProjectMerge(mergeInput(admin.id), prismaProjectMergeStore))
      .rejects.toThrow("third project")

    expect(await snapshotMergeState()).toEqual(before)
    expect(await prisma.adminAuditLog.count({
      where: { action: "account.project_merge", targetId: TARGET_ID, status: "success" },
    })).toBe(0)
    await expectSingleFailedMergeAudit(admin.id, /third project/)
  })

  it("rolls back active source invocation with zero committed writes", async () => {
    const admin = await seedAccountsAndProjects()
    await seedHappyPathContent()
    await seedActiveSourceInvocation()
    const before = await snapshotMergeState()

    await expect(applyProjectMerge(mergeInput(admin.id), prismaProjectMergeStore))
      .rejects.toThrow("active work")

    expect(await snapshotMergeState()).toEqual(before)
    expect(await prisma.adminAuditLog.count({
      where: { action: "account.project_merge", targetId: TARGET_ID, status: "success" },
    })).toBe(0)
    await expectSingleFailedMergeAudit(admin.id, /active work/)
  })
})
