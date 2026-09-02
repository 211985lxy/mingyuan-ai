import { describe, expect, it } from "vitest"
import { FORMAT_INSTRUCTIONS } from "@/lib/aim-agent-prompts"

describe("AIM script prompts（大道至简：怪规则已删）", () => {
  it("keeps the buzzword ban verbatim across script formats", () => {
    const BUZZWORDS = "禁止使用以下词汇：赋能、闭环、抓手、颗粒度、对齐、拉通、打通、沉淀、复盘、迭代、链路、触达、心智、赛道"
    for (const format of ["video_script", "koubo_script"] as const) {
      expect(FORMAT_INSTRUCTIONS[format]).toContain(BUZZWORDS)
    }
  })

  it("no longer injects pseudo-rhythm formulas or odd craft mandates", () => {
    // 大道至简整改：伪节奏公式（每10-12秒40字转折）、"文盲式修改"、
    // 视觉秒数公式、"前15秒/4个痛点"数字规则全部删除，口语化要求由通用条款承担。
    for (const format of ["video_script", "koubo_script", "shooting_brief"] as const) {
      const prompt = FORMAT_INSTRUCTIONS[format]
      expect(prompt).not.toContain("每10-12秒")
      expect(prompt).not.toContain("文盲式")
      expect(prompt).not.toContain("初中生")
    }
    expect(FORMAT_INSTRUCTIONS.shooting_brief).not.toContain("每2-4秒")
    for (const format of ["video_script", "koubo_script"] as const) {
      expect(FORMAT_INSTRUCTIONS[format]).not.toContain("前 15 秒")
    }
    // 口语化要求仍在（定性表述，不带数字公式）
    expect(FORMAT_INSTRUCTIONS.video_script).toContain("用口语化表达")
  })

  it("no longer forces a three-part arc on moments or community posts", () => {
    expect(FORMAT_INSTRUCTIONS.moments_post).not.toContain("三段感")
    expect(FORMAT_INSTRUCTIONS.community_message).not.toContain("共情/洞察/行动")
  })
})
