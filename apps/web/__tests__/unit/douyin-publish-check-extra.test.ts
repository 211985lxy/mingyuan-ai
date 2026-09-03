import { describe, expect, it } from "vitest"
import { flowScore, runDouyinPublishCheck } from "@/lib/douyin-publish-check"

describe("douyin-publish-check Task 10: R08 批量号措辞 & flowScore", () => {
  it("批量做账号文案 → flowScore 至少 1 个扣分点，或命中 high 级别规则", () => {
    const result = flowScore("教你批量做账号，一台手机做 100 个号，矩阵号运营技巧", true)
    // 至少 1 个扣分点
    expect(result.deductions.length).toBeGreaterThanOrEqual(1)
    // 其中 1 个是 R08_batch_account_wording，高风险
    const r08 = result.deductions.find((d) => d.ruleId === "R08_batch_account_wording")
    expect(r08).toBeDefined()
    expect(r08!.severity).toBe("high")
  })

  it("开关关=false：批量做账号文案不命中 R08_* / R06_* 系列（只扣 baseline 相关）", () => {
    const off = runDouyinPublishCheck("教你批量做账号，矩阵号一人做 50 号", false)
    const extraIds = new Set([
      "R06_brand_tool_word",
      "R07_ai_generated_material_flag",
      "R08_batch_account_wording",
      "R09_commercial_content_channel",
    ])
    const anyExtra = off.violations.some((v) => v.ruleId && extraIds.has(v.ruleId) && !v.advisory)
    expect(anyExtra).toBe(false)
  })

  it("开关开=true：douyin runDouyinPublishCheck 对 R06 品牌词命中 advisory=false 的必改项", () => {
    const on = runDouyinPublishCheck("这期我们用豆包和即梦做了个 demo", true)
    const r06 = on.violations.find((v) => v.ruleId === "R06_brand_tool_word")
    expect(r06).toBeDefined()
    expect(r06!.advisory).toBe(false)
    expect(r06!.severity).toBe("medium")
  })

  it("R09 赞助文案已通过星图报备 → 通过 clearedWhen 豁免，不命中 R09_*", () => {
    const on = runDouyinPublishCheck(
      "感谢 XX品牌 赞助本期内容，合作推广产品（已通过巨量星图报备）",
      true,
    )
    const r09 = on.violations.find((v) => v.ruleId === "R09_commercial_content_channel")
    expect(r09).toBeUndefined()
  })
})
