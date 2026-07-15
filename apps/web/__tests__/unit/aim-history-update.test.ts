import { describe, expect, it } from "vitest"
import {
  buildAimHistoryUpdateData,
  parseAimHistoryUpdate,
} from "@/lib/aim/services/history-update"

const CREATED_AT = "2026-07-15T00:00:00.000Z"

describe("AIM history update", () => {
  it("normalizes workflow fields and appends valid snapshots", () => {
    const parsed = parseAimHistoryUpdate({
      workflowStatus: "published",
      reviewNote: "  复核通过  ",
      publishPlatform: "  抖音  ",
      retroSnapshot: { summary: "  有效  ", actualData: "  10 个咨询  " },
      calibrationRule: { rule: "  下次保留案例  " },
    }, CREATED_AT)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const data = buildAimHistoryUpdateData(parsed.data, {
      decisionSnapshot: null,
      retroSnapshots: [{ summary: "旧复盘" }],
      calibrationRules: null,
    })

    expect(data.workflowStatus).toBe("published")
    expect(data.reviewNote).toBe("复核通过")
    expect(data.publishPlatform).toBe("抖音")
    expect(data.publishedAt).toBeInstanceOf(Date)
    expect(data.retroSnapshots).toEqual([
      { summary: "旧复盘" },
      { summary: "有效", actualData: "10 个咨询", verdict: undefined, nextRule: undefined, createdAt: CREATED_AT },
    ])
    expect(data.calibrationRules).toEqual([
      { rule: "下次保留案例", source: undefined, createdAt: CREATED_AT },
    ])
  })

  it.each([
    [{ decisionSnapshot: {} }, "发布前判断不能为空"],
    [{ retroSnapshot: {} }, "复盘结论不能为空"],
    [{ calibrationRule: {} }, "下次判断规则不能为空"],
  ])("rejects empty snapshot payloads", (body, error) => {
    expect(parseAimHistoryUpdate(body, CREATED_AT)).toEqual({ ok: false, error })
  })

  it("keeps an existing decision snapshot instead of overwriting it", () => {
    const parsed = parseAimHistoryUpdate({
      decisionSnapshot: { summary: "新的判断" },
    }, CREATED_AT)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    const existingDecision = { summary: "原有判断" }
    expect(buildAimHistoryUpdateData(parsed.data, {
      decisionSnapshot: existingDecision,
      retroSnapshots: null,
      calibrationRules: null,
    }).decisionSnapshot).toBe(existingDecision)
  })
})
