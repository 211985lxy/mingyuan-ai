/**
 * 治理配置 API + ApprovalDecision 数据库集成测试（WP-2）
 * 依赖 e2e 数据库；不可用时 skip。
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/prisma"
import { recordAdminAudit } from "@/lib/admin-audit"
import {
  createPrismaApprovalDecisionStore,
  listActiveGovernanceAssignments,
} from "@/lib/aim/approval-decision-prisma"
import { recordApprovalDecision } from "@/lib/aim/approval-decision-store"

const hasDb = Boolean(process.env.DATABASE_URL)
const describeDb = hasDb ? describe : describe.skip

let adminId = ""

describeDb("governance + approval DB integration", () => {
  beforeAll(async () => {
    const admin = await prisma.adminUser.upsert({
      where: { email: "governance-wp2@test.com" },
      create: {
        email: "governance-wp2@test.com",
        name: "WP2 Tester",
        password: "x",
        role: "admin",
      },
      update: {},
    })
    adminId = admin.id
    await prisma.approvalDecision.deleteMany({
      where: { requestId: { startsWith: "wp2-it:" } },
    })
    await prisma.governanceAssignment.deleteMany({
      where: { scopeId: { in: ["wp2-it-workflow", "wp2-it-system"] } },
    })
  })

  afterAll(async () => {
    await prisma.approvalDecision.deleteMany({
      where: { requestId: { startsWith: "wp2-it:" } },
    })
    await prisma.governanceAssignment.deleteMany({
      where: { scopeId: { in: ["wp2-it-workflow", "wp2-it-system"] } },
    })
    await prisma.adminAuditLog.deleteMany({ where: { adminId } })
    await prisma.adminUser.deleteMany({ where: { email: "governance-wp2@test.com" } })
    await prisma.$disconnect()
  })

  it("创建/停用 assignment 并写审计；列表有上限", async () => {
    const created = await prisma.governanceAssignment.create({
      data: {
        scopeType: "workflow",
        scopeId: "wp2-it-workflow",
        role: "business_owner",
        externalOpenId: "ou_wp2_owner",
        status: "active",
      },
    })
    const req = new NextRequest("http://localhost/api/admin/governance-assignments", {
      method: "POST",
    })
    const requestId = await recordAdminAudit({
      request: req,
      adminId,
      action: "governance_assignment.create",
      targetType: "governance_assignment",
      targetId: created.id,
      metadata: { scopeId: created.scopeId },
    })
    expect(requestId).toBeTruthy()

    const audit = await prisma.adminAuditLog.findFirst({
      where: { targetId: created.id, action: "governance_assignment.create" },
    })
    expect(audit).toBeTruthy()

    await prisma.governanceAssignment.update({
      where: { id: created.id },
      data: { status: "inactive" },
    })
    await recordAdminAudit({
      request: req,
      adminId,
      action: "governance_assignment.deactivate",
      targetType: "governance_assignment",
      targetId: created.id,
    })

    const listed = await listActiveGovernanceAssignments("wp2-it-workflow")
    expect(listed.every((row) => row.status === "active")).toBe(true)
    expect(listed.length).toBeLessThanOrEqual(200)
  })

  it("ApprovalDecision 唯一幂等 + effect 可恢复", async () => {
    const store = createPrismaApprovalDecisionStore()
    const input = {
      subjectType: "work_item" as const,
      subjectId: "rec_wp2_it",
      decision: "approve" as const,
      externalReviewerId: "ou_wp2_reviewer",
      externalReviewerUserId: "on_wp2_reviewer",
      roleSnapshot: "reviewer",
      reason: "集成测试通过",
      source: "feishu_card" as const,
      requestId: "wp2-it:msg1:approve:rec_wp2_it",
      workflowId: "wp2-it-workflow",
    }

    const first = await recordApprovalDecision(store, input, () => `apd_wp2_${Date.now()}`)
    expect(first.idempotent).toBe(false)

    const second = await recordApprovalDecision(store, input, () => "apd_should_not_create")
    expect(second.idempotent).toBe(true)
    expect(second.record.id).toBe(first.record.id)

    const failed = await store.updateEffect(first.record.id, {
      effectStatus: "failed",
      effectError: "transient",
    })
    expect(failed.effectStatus).toBe("failed")

    const applied = await store.updateEffect(first.record.id, {
      effectStatus: "applied",
      effectError: null,
    })
    expect(applied.effectStatus).toBe("applied")
    expect(applied.effectError).toBeNull()

    await store.updateEffect(first.record.id, {
      effectStatus: "none",
      effectError: null,
    })
    const claims = await Promise.all([
      store.claimEffect(first.record.id, "claim_a"),
      store.claimEffect(first.record.id, "claim_b"),
    ])
    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1)
    const winner = claims.find((claim) => claim.claimed)
    expect(winner).toBeTruthy()
    const settled = await store.settleEffect(
      first.record.id,
      winner?.record.effectClaimToken ?? "",
      { effectStatus: "applied" },
    )
    expect(settled.effectStatus).toBe("applied")

    const count = await prisma.approvalDecision.count({
      where: { requestId: input.requestId },
    })
    expect(count).toBe(1)
  })
})
