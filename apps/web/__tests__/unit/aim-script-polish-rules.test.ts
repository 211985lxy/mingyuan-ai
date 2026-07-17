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

  // video_script 与 koubo_script 共享的逐字规则行。抽常量后必须保持字节一致。
  it("keeps shared rhythm / plain-language / buzzword rules verbatim across script formats", () => {
    const RHYTHM = "节奏打磨：每10-12秒约40个字必须出现一个小转折、新观点或情绪点；如果段落太平，就用反问、比喻或一句结论拉住注意力"
    const PLAIN_LANGUAGE = "文盲式修改：删掉不影响意思的废话和虚词，用简单词替换书面语；每句话必须读起来顺口，像真人在说话；初中生听不懂就重写"
    const BUZZWORDS = "禁止使用以下词汇：赋能、闭环、抓手、颗粒度、对齐、拉通、打通、沉淀、复盘、迭代、链路、触达、心智、赛道"

    for (const format of ["video_script", "koubo_script"] as const) {
      const prompt = FORMAT_INSTRUCTIONS[format]
      expect(prompt).toContain(RHYTHM)
      expect(prompt).toContain(PLAIN_LANGUAGE)
      expect(prompt).toContain(BUZZWORDS)
    }
  })
})
