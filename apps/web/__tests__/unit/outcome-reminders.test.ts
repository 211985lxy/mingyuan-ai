import { describe, expect, it } from "vitest"
import {
  findDueOutcomeReminders,
  OUTCOME_REMINDER_WINDOWS,
  type OutcomeReminderStorePort,
} from "@/lib/aim/outcome-reminders"

// 经营结果回填提醒（阶段 4 WP4.3）：发布后第 7 / 14 / 30 天提醒回填。
// 关键契约：
// - 只统计已发布（workflowStatus=published 且有 publishedAt）的内容
// - 第 7/14/30 天窗口到期且无对应行 → missing=row
// - 有行但业务字段（有效评论/私信/线索/预约/成交/收入/用户判断）全空 → missing=metrics
// - 任一业务字段已填即视为已回填，不再提醒
// - 空值不填 0，不让 AI 猜测

const USER = "user_1"
const NOW = new Date("2026-07-18T09:00:00.000Z")

interface FakeGeneration {
  id: string
  projectId: string | null
  topicTitle: string | null
  publishedAt: Date | null
  publishPlatform: string | null
  publishUrl: string | null
}

interface FakeOutcome {
  generationId: string
  collectWindowDay: number
  qualifiedCommentCount: number | null
  dmCount: number | null
  qualifiedLeadCount: number | null
  appointmentCount: number | null
  dealCount: number | null
  revenue: number | null
  userVerdict: string | null
}

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 3600 * 1000)
}

function blankOutcome(generationId: string, collectWindowDay: number): FakeOutcome {
  return {
    generationId,
    collectWindowDay,
    qualifiedCommentCount: null,
    dmCount: null,
    qualifiedLeadCount: null,
    appointmentCount: null,
    dealCount: null,
    revenue: null,
    userVerdict: null,
  }
}

function makeStore(generations: FakeGeneration[], outcomes: FakeOutcome[]): OutcomeReminderStorePort {
  return {
    aimGeneration: {
      findMany: async () => generations.filter((g) => g.publishedAt != null),
    },
    contentOutcome: {
      findMany: async (args: { where: { generationId: { in: string[] } } }) =>
        outcomes.filter((o) => args.where.generationId.in.includes(o.generationId)),
    },
  }
}

function gen(id: string, publishedDaysAgo: number | null): FakeGeneration {
  return {
    id,
    projectId: "proj_1",
    topicTitle: `内容 ${id}`,
    publishedAt: publishedDaysAgo == null ? null : daysAgo(publishedDaysAgo),
    publishPlatform: "xiaohongshu",
    publishUrl: "https://example.com/note/1",
  }
}

describe("OUTCOME_REMINDER_WINDOWS", () => {
  it("covers day 7 / 14 / 30", () => {
    expect([...OUTCOME_REMINDER_WINDOWS]).toEqual([7, 14, 30])
  })
})

describe("findDueOutcomeReminders", () => {
  it("发布未满 7 天不提醒", async () => {
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 3)], []),
    })
    expect(reminders).toEqual([])
  })

  it("满 7 天且无第 7 天行 → missing=row", async () => {
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 8)], []),
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ generationId: "g1", windowDay: 7, missing: "row" })
  })

  it("第 7 天行业务字段全空 → missing=metrics", async () => {
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 8)], [blankOutcome("g1", 7)]),
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ windowDay: 7, missing: "metrics" })
  })

  it("任一业务字段已填 → 不再提醒该窗口", async () => {
    const filled = { ...blankOutcome("g1", 7), qualifiedLeadCount: 2 }
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 8)], [filled]),
    })
    expect(reminders).toEqual([])
  })

  it("只填了 0 也算已回填（用户确实填了 0），不再提醒", async () => {
    const filled = { ...blankOutcome("g1", 7), dealCount: 0 }
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 8)], [filled]),
    })
    expect(reminders).toEqual([])
  })

  it("满 14 天且第 7 天已填、第 14 天无行 → 只提醒第 14 天", async () => {
    const day7 = { ...blankOutcome("g1", 7), dmCount: 1 }
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 15)], [day7]),
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ windowDay: 14, missing: "row" })
  })

  it("满 14 天、第 7/14 都缺 → 按窗口升序提醒", async () => {
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 15)], []),
    })
    expect(reminders.map((r) => r.windowDay)).toEqual([7, 14])
  })

  it("满 30 天且第 7/14 天已填、第 30 天无行 → 只提醒第 30 天 missing=row", async () => {
    const day7 = { ...blankOutcome("g1", 7), dmCount: 1 }
    const day14 = { ...blankOutcome("g1", 14), qualifiedLeadCount: 1 }
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 31)], [day7, day14]),
    })
    expect(reminders).toHaveLength(1)
    expect(reminders[0]).toMatchObject({ windowDay: 30, missing: "row" })
  })

  it("满 30 天、三个窗口都缺 → 按窗口升序各提醒一次", async () => {
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 40)], []),
    })
    expect(reminders.map((r) => r.windowDay)).toEqual([7, 14, 30])
  })

  it("第 30 天行已填 → 30 天窗口不提醒", async () => {
    const day7 = { ...blankOutcome("g1", 7), dmCount: 1 }
    const day14 = { ...blankOutcome("g1", 14), appointmentCount: 0 }
    const day30 = { ...blankOutcome("g1", 30), userVerdict: "转化一般" }
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 31)], [day7, day14, day30]),
    })
    expect(reminders).toEqual([])
  })

  it("未发布（publishedAt 为空）的内容不参与提醒", async () => {
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", null)], []),
    })
    expect(reminders).toEqual([])
  })

  it("提醒携带标题、平台与链接，按到期时间升序", async () => {
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g_new", 8), gen("g_old", 20)], []),
    })
    expect(reminders.map((r) => r.generationId)).toEqual(["g_old", "g_old", "g_new"])
    expect(reminders[0]).toMatchObject({
      topicTitle: "内容 g_old",
      platform: "xiaohongshu",
      publishUrl: "https://example.com/note/1",
      windowDay: 7,
    })
    expect(reminders[0].dueAt.getTime()).toBeLessThan(reminders[1].dueAt.getTime())
  })
})

describe("formatOutcomeReminderDigest", () => {
  it("formats a digest for Feishu / UI push", async () => {
    const { formatOutcomeReminderDigest } = await import("@/lib/aim/outcome-reminders")
    const reminders = await findDueOutcomeReminders({
      userId: USER,
      now: NOW,
      store: makeStore([gen("g1", 8)], []),
    })
    const text = formatOutcomeReminderDigest(reminders)
    expect(text).toContain("经营结果回填提醒")
    expect(text).toContain("第 7 天")
    expect(text).toContain("内容 g1")
  })
})
