import { describe, expect, it } from "vitest"
import { buildLocalChecklist, computeEmojiDensity, findAbsoluteTerms } from "@/lib/xhs-review"

describe("小红书编辑检查", () => {
  it("检查标题长度、emoji 密度和绝对化用语", () => {
    const checks = buildLocalChecklist("这是一个标题", "这是最强的方案 🚀🚀🚀🚀")
    expect(checks.find((item) => item.item === "absolute")?.status).toBe("fail")
    expect(computeEmojiDensity("🚀🚀🚀🚀")).toBeGreaterThan(0)
    expect(findAbsoluteTerms("全网最低价")).toHaveLength(1)
  })
})

// Task 10：publish-precheck R06_* ~ R09_* 规则同步复用到小红书侧
describe("xhs-review Task 10 合规额外规则复用", () => {
  // 延迟 import，避免顶部循环依赖/顺序问题
  async function load() {
    return import("@/lib/xhs-review")
  }

  it("「豆包生成」文案 → 输出含 R06_brand_tool_word 提示且 severity>=medium（开=true）", async () => {
    const { runXhsComplianceCheck, runXhsExtraComplianceOnly } = await load()
    const all = runXhsComplianceCheck("豆包生成的这段文案你看看", true)
    const extra = runXhsExtraComplianceOnly("豆包生成的这段文案你看看", true)
    const r06 = extra.find((x) => x.ruleId === "R06_brand_tool_word")
    expect(r06).toBeDefined()
    // 断言 severity 为 medium（即 >= medium）
    expect(r06!.severity).toBe("medium")
    // 提示文本里包含 R06 对应原因（category=平台限流风险）
    const hitMsg = all.find((x) => x.ruleId === "R06_brand_tool_word")?.text ?? ""
    expect(hitMsg).toContain("限流")
  })

  it("R07 AI 生成素材未标注 → 命中 R07_ai_generated_material_flag (开=true)", async () => {
    const { runXhsExtraComplianceOnly } = await load()
    const extra = runXhsExtraComplianceOnly(
      "这张即梦图我修了一下，效果还不错 🔥",
      true,
    )
    const r07 = extra.find((x) => x.ruleId === "R07_ai_generated_material_flag")
    expect(r07).toBeDefined()
    expect(r07!.severity).toBe("low")
  })

  it("R09 赞助+合作未走星图 → 命中 R09_commercial_content_channel (开=true)", async () => {
    const { runXhsExtraComplianceOnly } = await load()
    const extra = runXhsExtraComplianceOnly(
      "本视频由 XX品牌 赞助播出，商务合作私信",
      true,
    )
    const r09 = extra.find((x) => x.ruleId === "R09_commercial_content_channel")
    expect(r09).toBeDefined()
    expect(r09!.severity).toBe("medium")
  })

  it("开关关=false 时 4 条文本均 0 命中 R06_* ~ R09_*", async () => {
    const { runXhsExtraComplianceOnly } = await load()
    const cases = [
      "这期我们用豆包和即梦做了个 demo",
      "这张图用 Seedream 生成，分享一下心得",
      "教你批量生产内容，矩阵号一人做 50 号",
      "感谢 XX品牌 赞助本期内容，合作推广产品",
    ]
    for (const c of cases) {
      expect(runXhsExtraComplianceOnly(c, false)).toHaveLength(0)
    }
  })
})
