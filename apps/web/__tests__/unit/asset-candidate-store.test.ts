import { beforeEach, describe, expect, it } from "vitest"
import {
  generateMeetingAssetCandidates,
  reviewAssetCandidate,
  type AssetCandidateStorePort,
} from "@/lib/aim/asset-candidate-store"

// 会后资产候选的落库与审核（90 天计划 3.1）。
// 关键契约：
// - 会议洞察必须人工审核通过（approve 或已有 humanReview 记录）才能生成候选
// - 幂等：同一会议重复生成不重复创建
// - 候选经人工批准后才能升级为正式知识；拒绝不升级
// - 跨项目复用默认 false，批准后可写入全局知识

const USER = "user_1"
const GEN_ID = "gen_meeting_1"

interface FakeRow {
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
}

function makeTaskSpec() {
  return {
    kind: "meeting_insight",
    schemaVersion: 1,
    workItemRecordId: "rec_feishu_1",
    meetingTitle: "启动会",
    customer: "葛老板",
    insight: {
      meetingTitle: "启动会",
      customer: "葛老板",
      pains: ["冬天室温上不去"],
      goals: ["提升获客"],
      budgets: [],
      decisionStage: "已成交",
      decisionStageRaw: "已成交",
      decisionStageUnresolved: false,
      objections: ["担心效果"],
      followUps: ["下周约二面"],
      diagnosisQuestions: ["目前获客渠道？"],
      topicCandidates: ["数字供暖省电吗"],
      deliveryTasks: [{ title: "输出诊断方案" }],
      budgetFigures: [],
      budgetSpecified: false,
    },
  }
}

function makeStore() {
  const generation = {
    id: GEN_ID,
    userId: USER,
    projectId: "proj_1",
    workflowStatus: "pending_review",
    taskSpec: makeTaskSpec() as Record<string, unknown>,
  }
  const rows: FakeRow[] = []
  const knowledgeEntries: Array<Record<string, unknown>> = []
  let seq = 0
  const store: AssetCandidateStorePort = {
    aimGeneration: {
      findFirst: async (args: { where: { id: string; userId: string } }) =>
        args.where.id === generation.id && args.where.userId === generation.userId
          ? { ...generation }
          : null,
      update: async (args: { where: { id: string }; data: { taskSpec: Record<string, unknown> } }) => {
        generation.taskSpec = args.data.taskSpec
        return { ...generation }
      },
    },
    assetCandidate: {
      findMany: async (args: { where: { generationId?: string; userId?: string } }) =>
        rows.filter(
          (r) =>
            (!args.where.generationId || r.generationId === args.where.generationId) &&
            (!args.where.userId || r.userId === args.where.userId),
        ),
      findFirst: async (args: { where: { id: string; userId: string } }) =>
        rows.find((r) => r.id === args.where.id && r.userId === args.where.userId) ?? null,
      create: async (args: { data: Omit<FakeRow, "id"> }) => {
        const row = { ...args.data, id: `cand_${++seq}` }
        rows.push(row)
        return row
      },
      update: async (args: { where: { id: string }; data: Partial<FakeRow> }) => {
        const row = rows.find((r) => r.id === args.where.id)
        if (!row) throw new Error("not found")
        Object.assign(row, args.data)
        return row
      },
    },
    knowledgeEntry: {
      create: async (args: { data: Record<string, unknown> }) => {
        knowledgeEntries.push(args.data)
        return { id: `entry_${knowledgeEntries.length}` }
      },
    },
  }
  return { store, rows, knowledgeEntries, generation }
}

describe("generateMeetingAssetCandidates", () => {
  let ctx: ReturnType<typeof makeStore>
  beforeEach(() => {
    ctx = makeStore()
  })

  it("会议洞察未经人工审核且未显式 approve → 409", async () => {
    const result = await generateMeetingAssetCandidates({
      userId: USER,
      generationId: GEN_ID,
      store: ctx.store,
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
  })

  it("approve=true 代表人工审核通过：写回 humanReview 并生成候选", async () => {
    const result = await generateMeetingAssetCandidates({
      userId: USER,
      generationId: GEN_ID,
      approve: true,
      store: ctx.store,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.created).toBeGreaterThan(0)
    const review = (ctx.generation.taskSpec as Record<string, unknown>).humanReview as {
      approvedBy: string
    }
    expect(review.approvedBy).toBe(USER)
    // feishuRecordId 必须来自 taskSpec.workItemRecordId
    expect(ctx.rows.every((r) => r.feishuRecordId === "rec_feishu_1")).toBe(true)
    // 全部候选默认 pending + 项目绑定 + 不允许跨项目
    expect(ctx.rows.every((r) => r.reviewStatus === "pending")).toBe(true)
    expect(ctx.rows.every((r) => r.projectId === "proj_1")).toBe(true)
    expect(ctx.rows.every((r) => r.crossProjectAllowed === false)).toBe(true)
  })

  it("已有 humanReview 记录后无需重复 approve 即可生成", async () => {
    ctx.generation.taskSpec.humanReview = { approvedAt: "2026-07-18T00:00:00Z", approvedBy: USER }
    const result = await generateMeetingAssetCandidates({
      userId: USER,
      generationId: GEN_ID,
      store: ctx.store,
    })
    expect(result.ok).toBe(true)
  })

  it("幂等：重复生成不重复创建，返回 skipped 计数", async () => {
    const first = await generateMeetingAssetCandidates({
      userId: USER,
      generationId: GEN_ID,
      approve: true,
      store: ctx.store,
    })
    const second = await generateMeetingAssetCandidates({
      userId: USER,
      generationId: GEN_ID,
      store: ctx.store,
    })
    expect(first.ok && second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(second.created).toBe(0)
    expect(second.skipped).toBe(first.created)
    expect(ctx.rows).toHaveLength(first.created)
  })

  it("非会议洞察记录 → 409", async () => {
    ctx.generation.taskSpec = { kind: "content_brief" }
    const result = await generateMeetingAssetCandidates({
      userId: USER,
      generationId: GEN_ID,
      approve: true,
      store: ctx.store,
    })
    expect(result).toMatchObject({ ok: false, status: 409 })
  })

  it("记录不存在或属于他人 → 404", async () => {
    const result = await generateMeetingAssetCandidates({
      userId: "other_user",
      generationId: GEN_ID,
      approve: true,
      store: ctx.store,
    })
    expect(result).toMatchObject({ ok: false, status: 404 })
  })
})

describe("reviewAssetCandidate", () => {
  let ctx: ReturnType<typeof makeStore>
  beforeEach(async () => {
    ctx = makeStore()
    await generateMeetingAssetCandidates({
      userId: USER,
      generationId: GEN_ID,
      approve: true,
      store: ctx.store,
    })
  })

  it("approve + promote：升级为正式知识并回写 promotedEntryId", async () => {
    const candidate = ctx.rows.find((r) => r.kind === "pain_point")!
    const result = await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "approve",
      promote: true,
      store: ctx.store,
    })
    expect(result.ok).toBe(true)
    expect(ctx.knowledgeEntries).toHaveLength(1)
    const entry = ctx.knowledgeEntries[0]
    expect(entry.category).toBe("customer_pain")
    expect(entry.sourceType).toBe("meeting_insight")
    expect(entry.projectId).toBe("proj_1")
    const updated = ctx.rows.find((r) => r.id === candidate.id)!
    expect(updated.reviewStatus).toBe("approved")
    expect(updated.promotedEntryId).toBe("entry_1")
  })

  it("case_candidate 升级后进入 project_case 分类", async () => {
    const candidate = ctx.rows.find((r) => r.kind === "case_candidate")!
    await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "approve",
      promote: true,
      store: ctx.store,
    })
    expect(ctx.knowledgeEntries[0].category).toBe("project_case")
  })

  it("approve 不 promote：只改状态，不建知识", async () => {
    const candidate = ctx.rows[0]
    const result = await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "approve",
      store: ctx.store,
    })
    expect(result.ok).toBe(true)
    expect(ctx.knowledgeEntries).toHaveLength(0)
    expect(ctx.rows[0].reviewStatus).toBe("approved")
  })

  it("crossProjectAllowed=true 且 promote：知识写入全局（projectId=null）", async () => {
    const candidate = ctx.rows.find((r) => r.kind === "objection")!
    await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "approve",
      promote: true,
      crossProjectAllowed: true,
      store: ctx.store,
    })
    expect(ctx.knowledgeEntries[0].projectId).toBeNull()
    expect(ctx.rows.find((r) => r.id === candidate.id)!.crossProjectAllowed).toBe(true)
  })

  it("reject：标记拒绝且不升级", async () => {
    const candidate = ctx.rows[0]
    const result = await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "reject",
      store: ctx.store,
    })
    expect(result.ok).toBe(true)
    expect(ctx.rows[0].reviewStatus).toBe("rejected")
    expect(ctx.knowledgeEntries).toHaveLength(0)
  })

  it("已 approved 的候选不能再 reject；重复 approve 幂等", async () => {
    const candidate = ctx.rows[0]
    await reviewAssetCandidate({ userId: USER, candidateId: candidate.id, action: "approve", store: ctx.store })
    const conflict = await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "reject",
      store: ctx.store,
    })
    expect(conflict).toMatchObject({ ok: false, status: 409 })
    const again = await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "approve",
      store: ctx.store,
    })
    expect(again.ok).toBe(true)
  })

  it("已 approved 且未升级的候选允许补升级（promote）", async () => {
    const candidate = ctx.rows.find((r) => r.kind === "content_topic")!
    await reviewAssetCandidate({ userId: USER, candidateId: candidate.id, action: "approve", store: ctx.store })
    const result = await reviewAssetCandidate({
      userId: USER,
      candidateId: candidate.id,
      action: "approve",
      promote: true,
      store: ctx.store,
    })
    expect(result.ok).toBe(true)
    expect(ctx.knowledgeEntries).toHaveLength(1)
  })

  it("审核他人候选 → 404", async () => {
    const result = await reviewAssetCandidate({
      userId: "other_user",
      candidateId: ctx.rows[0].id,
      action: "approve",
      store: ctx.store,
    })
    expect(result).toMatchObject({ ok: false, status: 404 })
  })
})
