import { describe, expect, it } from "vitest"

import {
  buildExternalMemoryTags,
  parseExternalAiMemoryText,
} from "@/lib/knowledge/external-ai-memory-parse"

const WORKBUDDY_SAMPLE = `关于你的记忆


工作背景
用户xiangyu，工作地位于杭州，核心职责围绕业务拓展（招商）展开。日常使用微盛企微管家SCRM进行客户管理。
个人背景
用户使用中文交流，偏好简洁指令式沟通（如"做个整理"），期望AI主动推进。
当前关注
当前聚焦六方面：一是Mac系统性能优化；二是技术工具层面。
近期动态
- 研究Xray与Clash网络代理工具兼容性。
- 推进招聘全流程。
`

describe("parseExternalAiMemoryText", () => {
  it("拆分 WorkBuddy「关于你的记忆」四段，未填写段不瞎补", () => {
    const parsed = parseExternalAiMemoryText(WORKBUDDY_SAMPLE)
    expect(parsed.ok).toBe(true)
    expect(parsed.source).toBe("workbuddy")
    expect(parsed.confidence).toBe("high")
    expect(parsed.drafts).toHaveLength(4)
    expect(parsed.drafts.map((d) => d.sectionKey)).toEqual([
      "work_background",
      "personal_background",
      "current_focus",
      "recent_activity",
    ])
    expect(parsed.drafts[0]?.content).toContain("xiangyu")
    expect(parsed.drafts[0]?.content).not.toContain("个人背景")
    expect(parsed.drafts[3]?.content).toContain("Xray")
  })

  it("Codex 风格 Markdown 标题可识别", () => {
    const parsed = parseExternalAiMemoryText(`## Memory

## Work background
Builds AIM products in Hangzhou.

## Preferences
Prefers concise Chinese replies.
`)
    expect(parsed.ok).toBe(true)
    expect(parsed.source).toBe("codex")
    expect(parsed.drafts.length).toBeGreaterThanOrEqual(2)
  })

  it("认不出结构时整段原文入库，不编数字不拆碎", () => {
    const text = "这是一段没有标题的随手笔记，讲的是招商和短视频。"
    const parsed = parseExternalAiMemoryText(text)
    expect(parsed.ok).toBe(true)
    expect(parsed.confidence).toBe("low")
    expect(parsed.drafts).toHaveLength(1)
    expect(parsed.drafts[0]?.content).toBe(text)
    expect(parsed.drafts[0]?.sectionKey).toBe("full_text")
  })

  it("空文本失败可见", () => {
    const parsed = parseExternalAiMemoryText("   ")
    expect(parsed.ok).toBe(false)
    expect(parsed.drafts).toHaveLength(0)
  })

  it("tags 带溯源", () => {
    expect(buildExternalMemoryTags("workbuddy", "work_background")).toEqual([
      "external_ai_memory",
      "base_memory",
      "source:workbuddy",
      "section:work_background",
    ])
  })
})
