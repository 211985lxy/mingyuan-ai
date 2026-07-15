import { describe, expect, it } from "vitest"

import {
  buildConversationIntentBlock,
  resolveAimConversationIntentWithRules,
} from "@/lib/aim-conversation-intent"

describe("aim-conversation-intent", () => {
  it("把自然追问识别为 chat", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [{ role: "user", content: "你觉得这句话为什么别扭？" }],
    })

    expect(result.intent.mode).toBe("chat")
    expect(result.intent.useKnowledge).toBe(false)
  })

  it("把纠偏指令识别为 follow_up_edit", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "assistant", content: "如果你创业到现在，还没盈利但也没倒闭，这条一定要看完。" },
        { role: "user", content: "不是让你重写整篇，我是说结合这篇稿子改上面那个文案，不要换。" },
      ],
    })

    expect(result.intent.mode).toBe("follow_up_edit")
    expect(result.intent.targetSummary).toContain("还没盈利但也没倒闭")
    expect(result.intent.useMethodology).toBe(false)
  })

  it("把局部修改识别为 local_edit", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "assistant", content: "原稿正文" },
        { role: "user", content: "把这篇的开头改一下，后面正文不要动。" },
      ],
    })

    expect(result.intent.mode).toBe("local_edit")
    expect(result.intent.useKnowledge).toBe(false)
  })

  it("局部改稿里点名人设和卖点时，强制开启知识库", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "assistant", content: "原稿正文" },
        { role: "user", content: "把这版结合人设资料、产品卖点和老板卖点自然融进去，别越改越短。" },
      ],
    })

    expect(result.intent.mode).toBe("follow_up_edit")
    expect(result.intent.useKnowledge).toBe(true)
  })

  it("把版本选择识别为 select_version", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "assistant", content: "1. 第一条\n2. 第二条" },
        { role: "user", content: "就第一条，往下接着写。" },
      ],
    })

    expect(result.intent.mode).toBe("select_version")
    expect(result.intent.useStyleProfile).toBe(false)
  })

  it("把完整交付识别为 formal_delivery", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [{ role: "user", content: "直接输出一版完整发布计划和资产包。" }],
    })

    expect(result.intent.mode).toBe("formal_delivery")
    expect(result.intent.useKnowledge).toBe(true)
    expect(result.intent.useMethodology).toBe(true)
  })

  it("明确另开一篇时，优先识别为独立新任务", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "assistant", content: "第一篇文案正文" },
        { role: "user", content: "新任务：结合人设资料，另写一篇关于客户需求的口播稿。" },
      ],
    })

    expect(result.intent.mode).toBe("new_task")
    expect(result.intent.targetSummary).toBe("")
    expect(result.intent.useKnowledge).toBe(true)
  })

  it("多轮写作对话里的非明确指令交给完整意图判断", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "user", content: "先写一篇创业口播稿" },
        { role: "assistant", content: "第一篇文案正文" },
        { role: "user", content: "结合我们的表达风格，写客户为什么迟迟不成交。" },
      ],
    })

    expect(result.needsLlmFallback).toBe(true)
  })

  it("生成链路带历史对话时，优先理解本次生成输入", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "deep_copywriter",
      messages: [{
        role: "user",
        content: [
          "【本轮对话】",
          "用户：把这个目标人群改成李立星的目标人群",
          "助手：已经给出框架调整建议",
          "用户：不用再分析了 直接生成文案",
          "",
          "【本次生成输入】",
          "不用再分析了，直接生成文案",
        ].join("\n"),
      }],
    })

    expect(result.intent.mode).toBe("formal_delivery")
    expect(result.intent.reason).toContain("正式交付")
  })

  it("默认引用最近一版成稿，不回跳到更早内容", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "assistant", content: "最早的对标文案：创业最难的不是怎么赢，是怎么不输。" },
        { role: "assistant", content: "当前稿子：如果你创业到现在，还没盈利但也没倒闭，这条一定要看完。" },
        { role: "user", content: "结合这篇稿子去改上面那个文案，不要换。" },
      ],
    })

    expect(result.intent.mode).toBe("follow_up_edit")
    expect(result.intent.targetSummary).toContain("当前稿子")
    expect(result.intent.targetSummary).not.toContain("最早的对标文案")
  })

  it("明确点名最早那版时，回指最早内容", () => {
    const result = resolveAimConversationIntentWithRules({
      agentId: "content_producer",
      messages: [
        { role: "assistant", content: "最早的对标文案：创业最难的不是怎么赢，是怎么不输。" },
        { role: "assistant", content: "当前稿子：如果你创业到现在，还没盈利但也没倒闭，这条一定要看完。" },
        { role: "user", content: "按最早那版原始对标文案重写一版。" },
      ],
    })

    expect(result.intent.targetSummary).toContain("最早的对标文案")
  })

  it("全局意图块明确锁定当前指令优先级", () => {
    const block = buildConversationIntentBlock({
      mode: "follow_up_edit",
      confidence: 1,
      reason: "用户在纠偏",
      targetSummary: "",
      useKnowledge: false,
      useMethodology: false,
      useLongTermMemory: true,
      useStyleProfile: true,
    })

    expect(block).toContain("用户当前明确指令 > 当前任务所需上下文 > 历史对话")
    expect(block).toContain("只能辅助执行")
    expect(block).toContain("先按他的纠正改")
  })
})
