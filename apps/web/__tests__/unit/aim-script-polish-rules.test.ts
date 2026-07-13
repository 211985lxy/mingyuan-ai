import { describe, expect, it } from "vitest"
import { FORMAT_INSTRUCTIONS } from "@/lib/aim-agent-prompts"

describe("AIM script polish rules", () => {
  it("keeps spoken rhythm and visual change rules in script prompts", () => {
    expect(FORMAT_INSTRUCTIONS.video_script).toContain("每10-12秒约40个字")
    expect(FORMAT_INSTRUCTIONS.video_script).toContain("小转折、新观点或情绪点")
    expect(FORMAT_INSTRUCTIONS.shooting_brief).toContain("每2-4秒安排一个视觉变化点")
    expect(FORMAT_INSTRUCTIONS.koubo_script).toContain("文盲式修改")
    expect(FORMAT_INSTRUCTIONS.koubo_script).toContain("初中生听不懂就重写")
  })
})
