import { describe, expect, it } from "vitest"
import { getAimPendingGenerationMessage } from "@/hooks/use-aim-generation-actions"

describe("AIM generation status", () => {
  it("does not claim that quick mode reads project context", () => {
    const message = getAimPendingGenerationMessage(false, "生成口播文案")
    expect(message).toContain("根据本次输入")
    expect(message).not.toContain("项目资料")
    expect(message).not.toContain("知识库")
  })

  it("describes project context only when a project is active", () => {
    expect(getAimPendingGenerationMessage(true, "生成口播文案")).toContain("当前项目资料")
  })
})
