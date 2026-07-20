import { describe, expect, it, vi } from "vitest"

vi.mock("@/env", () => ({ env: { NEXT_PUBLIC_APP_URL: "https://aim.example.com" } }))

import { buildInspirationReplyText, INSPIRATION_ACCEPTED_REPLY } from "@/features/topics/services/inspiration-reply"

describe("inspiration group replies", () => {
  it("formats the accepted acknowledgement", () => {
    expect(INSPIRATION_ACCEPTED_REPLY).toBe("已收录，正在提取视频文案并生成选题。")
  })

  it("includes recommendation, hook, alternatives and a record link", () => {
    const text = buildInspirationReplyText({
      generatedTopics: [
        { title: "为什么越专业越难成交", hook: "客户不是不信你，而是听不懂你。" },
        { title: "专业表达的三个坑" },
        { title: "把术语翻译成人话" },
      ],
      topicSelectionId: "topic-1",
    })
    expect(text).toContain("推荐先拍：为什么越专业越难成交")
    expect(text).toContain("开头：客户不是不信你，而是听不懂你。")
    expect(text).toContain("还能拍：专业表达的三个坑、把术语翻译成人话")
    expect(text).toContain("https://aim.example.com/topic-planning?selectionId=topic-1")
  })

  it("uses an actionable failure reply", () => {
    expect(buildInspirationReplyText({ generatedTopics: null, topicSelectionId: null, errorMessage: "视频超过10分钟，暂不支持自动收录。" })).toContain("视频超过10分钟")
  })
})
