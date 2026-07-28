import { describe, expect, it } from "vitest"
import { buildAssetCandidatesFromOutcome } from "@/lib/aim/outcome-asset-candidates"
import {
  isNegativeOutcomeVerdict,
  isPositiveOutcomeVerdict,
  parseOutcomeVerdictCode,
  resolveOutcomeVerdictCode,
} from "@/lib/aim/outcome-verdict"
import { sanitizeOutcomeBody } from "@/lib/content-outcome"

describe("outcome-verdict", () => {
  it("parse 只接受合法码，不猜测自由文本", () => {
    expect(parseOutcomeVerdictCode("effective")).toBe("effective")
    expect(parseOutcomeVerdictCode("无效")).toBeNull()
    expect(parseOutcomeVerdictCode("有效")).toBeNull()
    expect(parseOutcomeVerdictCode("")).toBeNull()
  })

  it("历史无码读取为 unknown，不得自动升级", () => {
    expect(resolveOutcomeVerdictCode(null)).toBe("unknown")
    expect(resolveOutcomeVerdictCode(undefined)).toBe("unknown")
    expect(resolveOutcomeVerdictCode("garbage")).toBe("unknown")
  })

  it("正向/负向判定互斥且不看自由文本", () => {
    expect(isPositiveOutcomeVerdict("effective")).toBe(true)
    expect(isPositiveOutcomeVerdict("excellent")).toBe(true)
    expect(isPositiveOutcomeVerdict("neutral")).toBe(false)
    expect(isPositiveOutcomeVerdict("unknown")).toBe(false)
    expect(isNegativeOutcomeVerdict("ineffective")).toBe(true)
    expect(isNegativeOutcomeVerdict("failed")).toBe(true)
    expect(isNegativeOutcomeVerdict("neutral")).toBe(false)
  })
})

describe("sanitizeOutcomeBody verdictCode", () => {
  it("写入 verdictCode，并把 verdictNote 映射到 userVerdict", () => {
    const sanitized = sanitizeOutcomeBody({
      collectWindowDay: 7,
      verdictCode: "ineffective",
      verdictNote: "这条完全没反馈",
    })
    expect(sanitized.verdictCode).toBe("ineffective")
    expect(sanitized.userVerdict).toBe("这条完全没反馈")
  })

  it("非法 verdictCode 存 null（读取侧 unknown）", () => {
    const sanitized = sanitizeOutcomeBody({
      collectWindowDay: 14,
      verdictCode: "看起来不错",
      userVerdict: "看起来不错",
    })
    expect(sanitized.verdictCode).toBeNull()
    expect(sanitized.userVerdict).toBe("看起来不错")
  })
})

describe("buildAssetCandidatesFromOutcome verdict semantics", () => {
  const base = {
    outcomeId: "o1",
    generationId: "gen_1",
    projectId: "proj_1",
    platform: "douyin",
    copy: "成稿",
    topicTitle: "选题A",
    qualifiedLeadCount: null as number | null,
    appointmentCount: null as number | null,
    dealCount: null as number | null,
    revenue: null as number | null,
    userVerdict: null as string | null,
    reason: "user_excellent",
  }

  it("「无效」自由文本不得因包含「有效」生成正向候选", () => {
    const drafts = buildAssetCandidatesFromOutcome({
      ...base,
      userVerdict: "无效",
      verdictCode: null,
    })
    expect(drafts.some((d) => d.kind === "content_topic")).toBe(false)
    expect(drafts.some((d) => d.kind === "methodology_revision")).toBe(false)
  })

  it("ineffective/failed 只生成方法论修订候选", () => {
    const drafts = buildAssetCandidatesFromOutcome({
      ...base,
      verdictCode: "ineffective",
      userVerdict: "无效，没人看",
    })
    expect(drafts.map((d) => d.kind)).toEqual(["methodology_revision"])
  })

  it("neutral 不生成成功或失败候选", () => {
    const drafts = buildAssetCandidatesFromOutcome({
      ...base,
      verdictCode: "neutral",
      userVerdict: "一般",
    })
    expect(drafts).toEqual([])
  })

  it("成交/预约生成转化案例候选，标题不含成功案例", () => {
    const drafts = buildAssetCandidatesFromOutcome({
      ...base,
      dealCount: 1,
      verdictCode: "neutral",
    })
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.kind).toBe("case_candidate")
    expect(drafts[0]?.title).toContain("转化案例候选")
    expect(drafts[0]?.title).not.toContain("成功案例")
  })

  it("effective 可生成内容规律候选", () => {
    const drafts = buildAssetCandidatesFromOutcome({
      ...base,
      verdictCode: "effective",
    })
    expect(drafts.some((d) => d.kind === "content_topic")).toBe(true)
    expect(drafts.some((d) => d.kind === "methodology_revision")).toBe(false)
  })
})
