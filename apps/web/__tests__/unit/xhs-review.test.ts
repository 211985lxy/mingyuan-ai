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
