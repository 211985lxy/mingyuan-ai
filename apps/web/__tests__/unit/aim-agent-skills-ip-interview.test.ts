import { describe, expect, it } from "vitest"

import { IP_INTERVIEW_SKILLS } from "@/lib/aim-agent-skills"

describe("aim agent skills — IP_INTERVIEW_SKILLS (ip_interview)", () => {
  it("has non-empty id / label / description / prompt with correct structure", () => {
    expect(IP_INTERVIEW_SKILLS).toBeInstanceOf(Array)
    expect(IP_INTERVIEW_SKILLS.length).toBeGreaterThanOrEqual(1)

    const skill = IP_INTERVIEW_SKILLS[0]
    expect(skill).toBeDefined()
    expect(typeof skill.id).toBe("string")
    expect(skill.id.trim()).not.toBe("")
    expect(skill.id).toBe("ip_interview")

    expect(typeof skill.label).toBe("string")
    expect(skill.label.trim()).not.toBe("")

    expect(typeof skill.description).toBe("string")
    expect(skill.description.trim()).not.toBe("")

    expect(typeof skill.prompt).toBe("string")
    expect(skill.prompt.trim()).not.toBe("")
  })

  it("prompt contains all six dimension keywords", () => {
    const prompt = IP_INTERVIEW_SKILLS[0].prompt

    expect(prompt).toContain("做过什么")
    expect(prompt).toContain("在做什么业务")
    expect(prompt).toContain("擅长与不擅长")
    expect(prompt).toContain("服务谁")
    expect(prompt).toContain("表达习惯")
    expect(prompt).toContain("内容边界")
  })

  it("prompt contains 与其他 skill 的对比 or equivalent contrast (content production ≠ info gathering)", () => {
    const prompt = IP_INTERVIEW_SKILLS[0].prompt

    const hasExplicitContrast = prompt.includes("与其他 skill 的对比")
      || prompt.includes("与其他skill的对比")
    const hasContentProducerContrast = prompt.includes("content_producer")
      || prompt.includes("写稿 skill")
      || (prompt.includes("信息采集") && (prompt.includes("内容生产") || prompt.includes("生产内容")))

    expect(hasExplicitContrast || hasContentProducerContrast).toBe(true)
  })
})
