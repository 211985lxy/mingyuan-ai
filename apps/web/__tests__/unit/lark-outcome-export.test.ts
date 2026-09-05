import { describe, expect, it, vi } from "vitest"

import { exportLarkBaseResult } from "@/lib/lark-base-tool"

const BASE_ENV = {
  LARK_BASE_TOKEN: "token-1",
  LARK_TOPIC_TABLE_ID: "tbl-topic",
  LARK_RESULT_TABLE_ID: "tbl-result",
  LARK_OUTCOME_TABLE_ID: "tbl-outcome",
}

function buildDb(outcome: Record<string, unknown> | null) {
  return {
    clientProject: { findFirst: vi.fn(async () => ({ id: "proj-1", name: "测试项目" })) },
    knowledgeEntry: {
      findFirst: vi.fn(async () => null),
      update: vi.fn(async () => ({ id: "k" })),
      create: vi.fn(async () => ({ id: "k" })),
    },
    aimGeneration: {
      findFirst: vi.fn(async () => ({ id: "gen-1", topicTitle: "选题A", rawInput: "原始输入" })),
    },
    topicSelection: { findFirst: vi.fn(async () => null) },
    contentOutcome: { findFirst: vi.fn(async () => outcome) },
  }
}

const outcomeRow = {
  id: "outcome-1",
  userId: "user-1",
  generationId: "gen-1",
  collectWindowDay: 7,
  views: 1200,
  likes: null,
  comments: null,
  saves: null,
  shares: null,
  qualifiedCommentCount: null,
  dmCount: 3,
  qualifiedLeadCount: null,
  appointmentCount: null,
  dealCount: 1,
  revenue: "1280.5",
  verdictCode: "effective",
}

describe("exportLarkBaseResult outcome（复盘记录写出飞书）", () => {
  it("未配置 LARK_OUTCOME_TABLE_ID 时显式报错，不落通用结果表", async () => {
    const env = { ...BASE_ENV }
    delete env.LARK_OUTCOME_TABLE_ID
    await expect(
      exportLarkBaseResult({
        userId: "user-1",
        projectId: "proj-1",
        resultType: "outcome",
        resultId: "outcome-1",
        env,
        db: buildDb(outcomeRow),
        runCommand: vi.fn(async () => ({})),
      }),
    ).rejects.toThrow("缺少 LARK_OUTCOME_TABLE_ID")
  })

  it("复盘记录不存在时如实报错", async () => {
    await expect(
      exportLarkBaseResult({
        userId: "user-1",
        projectId: "proj-1",
        resultType: "outcome",
        resultId: "outcome-missing",
        env: BASE_ENV,
        db: buildDb(null),
        runCommand: vi.fn(async () => ({})),
      }),
    ).rejects.toThrow("复盘记录不存在")
  })

  it("写出字段：行级唯一键=outcome.id，未回填指标不列入内容", async () => {
    const runCommand = vi.fn(async () => ({ ok: true }))
    const result = await exportLarkBaseResult({
      userId: "user-1",
      projectId: "proj-1",
      resultType: "outcome",
      resultId: "outcome-1",
      env: BASE_ENV,
      db: buildDb(outcomeRow),
      runCommand,
    })
    expect(result.ok).toBe(true)
    expect(runCommand).toHaveBeenCalledTimes(1)
    const [command, args] = runCommand.mock.calls[0]
    expect(command).toBe("+record-upsert")
    expect(args).toContain("--table-id")
    expect(args[args.indexOf("--table-id") + 1]).toBe("tbl-outcome")
    const fields = JSON.parse(args[args.indexOf("--json") + 1]) as Record<string, unknown>
    expect(fields["AIM结果ID"]).toBe("outcome-1") // 行级唯一，重复导出按行 upsert
    expect(fields["内容ID"]).toBe("gen-1")
    expect(fields["数据窗口"]).toBe("第7天累计")
    expect(fields["类型"]).toBe("复盘记录")
    expect(fields["状态"]).toBe("有效")
    expect(fields["内容"]).toContain("播放 1200")
    expect(fields["内容"]).toContain("私信 3")
    expect(fields["内容"]).toContain("营收 ¥1280.5")
    expect(fields["内容"]).not.toContain("点赞") // 未回填指标不写，空值≠0
    expect(fields["内容"]).toContain("不相加")
  })

  it("全空指标记录仍可导出，内容显式说明无数据", async () => {
    const runCommand = vi.fn(async () => ({}))
    await exportLarkBaseResult({
      userId: "user-1",
      projectId: "proj-1",
      resultType: "outcome",
      resultId: "outcome-1",
      env: BASE_ENV,
      db: buildDb({ ...outcomeRow, views: null, dmCount: null, dealCount: null, revenue: null, verdictCode: null }),
      runCommand,
    })
    const args = runCommand.mock.calls[0][1]
    const fields = JSON.parse(args[args.indexOf("--json") + 1]) as Record<string, unknown>
    expect(fields["内容"]).toContain("暂无已回填指标")
    expect(fields["状态"]).toBe("已回填")
  })
})
