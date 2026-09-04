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
      publishUrl: "  https://www.douyin.com/video/123  ",
      retroSnapshot: { summary: "  有效  ", actualData: "  10 个咨询  " },
      calibrationRule: { rule: "  下次保留案例  " },
    }, CREATED_AT, { fromStatus: "ready_to_publish" })

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
    expect(data.publishUrl).toBe("https://www.douyin.com/video/123")
    expect(data.publishedAt).toBeInstanceOf(Date)
    expect(data.retroSnapshots).toEqual([
      { summary: "旧复盘" },
      { summary: "有效", actualData: "10 个咨询", verdict: undefined, nextRule: undefined, createdAt: CREATED_AT },
    ])
    expect(data.calibrationRules).toEqual([
      { rule: "下次保留案例", source: undefined, createdAt: CREATED_AT },
    ])
  })

  it("rejects illegal workflow jumps with a clear error", () => {
    expect(
      parseAimHistoryUpdate(
        { workflowStatus: "published", publishPlatform: "抖音" },
        CREATED_AT,
        { fromStatus: "draft" },
      ),
    ).toEqual({
      ok: false,
      error: "不能从「草稿」直接跳到「已发布」",
    })
  })

  it("rejects published without platform", () => {
    expect(
      parseAimHistoryUpdate(
        { workflowStatus: "published" },
        CREATED_AT,
        { fromStatus: "ready_to_publish" },
      ),
    ).toEqual({
      ok: false,
      error: "登记已发布时必须填写发布平台",
    })
  })

  it("rejects published without publishUrl（WP-A 作品键强制点）", () => {
    expect(
      parseAimHistoryUpdate(
        { workflowStatus: "published", publishPlatform: "抖音" },
        CREATED_AT,
        { fromStatus: "ready_to_publish" },
      ),
    ).toEqual({
      ok: false,
      error: "登记已发布时必须填写作品链接或作品 ID（用于经营归因）",
    })
  })

  it("allows published reusing existing platform and 作品键（本次不传也可）", () => {
    const parsed = parseAimHistoryUpdate(
      { workflowStatus: "published" },
      CREATED_AT,
      {
        fromStatus: "ready_to_publish",
        existingPublishPlatform: "小红书",
        existingPublishUrl: "https://www.xiaohongshu.com/explore/abc",
      },
    )
    expect(parsed.ok).toBe(true)
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
