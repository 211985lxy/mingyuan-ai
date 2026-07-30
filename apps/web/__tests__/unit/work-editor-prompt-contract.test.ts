import { beforeEach, describe, expect, it, vi } from "vitest"

import type { AimChatParams } from "@/lib/aim-agent-handlers"
import { WorkEditorHandler } from "@/lib/aim-agent-work-editor"

const mocks = vi.hoisted(() => ({ execute: vi.fn() }))

vi.mock("@/lib/aim-agent-model", () => ({
  executeChatLLM: mocks.execute,
  executeChatLLMStream: mocks.execute,
}))

vi.mock("@/lib/aim-harness/persistence", () => ({
  saveAimGenerationRecord: vi.fn().mockResolvedValue({ id: "gen-1", knowledgeUsed: [] }),
}))

vi.mock("@/lib/aim-generation-prompts", () => ({
  buildWorkflowContext: vi.fn(() => ""),
  ensureContentCreationTrace: vi.fn((c: string) => c),
  CONTENT_CREATION_TRACE_RULE: "",
  executeGenerateLLMWithBenchmarkRetry: mocks.execute,
}))

function baseChatParams(overrides: {
  runtimeTask?: AimChatParams["runtimeTask"]
  latestUser?: string
}): AimChatParams {
  return {
    userId: "u1",
    messages: [{ role: "user", content: overrides.latestUser ?? "把开头改得更有冲突感" }],
    knowledgeBlock: "",
    conversationBlock: "",
    methodologyBlock: "",
    businessDiagnosisBlock: "",
    ipWikiBlock: "",
    runtimeTask: overrides.runtimeTask,
  } as unknown as AimChatParams
}

describe("work_editor 提示词：light_edit 不注入高风险验证区块", () => {
  beforeEach(() => {
    mocks.execute.mockReset().mockResolvedValue({ content: "润色结果" })
  })

  it("light_edit 下不注入 AIM_HIGH_RISK_LOOP_RULE", async () => {
    await new WorkEditorHandler().chat(baseChatParams({ runtimeTask: "light_edit" }))
    const prompt = mocks.execute.mock.calls[0][1] as string
    expect(prompt).not.toContain("高风险任务验证规则")
    expect(prompt).not.toContain("缺失事实统一写「未提供/待补充」")
    expect(prompt).toContain("不要擅自改主题或扩写成全新长文")
  })

  it("非 light_edit 任务（如 rewrite_copy）仍正常注入高风险验证区块", async () => {
    await new WorkEditorHandler().chat(baseChatParams({
      runtimeTask: "rewrite_copy",
      latestUser: "按这篇对标原文整体重写一版",
    }))
    const prompt = mocks.execute.mock.calls[0][1] as string
    expect(prompt).toContain("高风险任务验证规则")
  })

  it("未传 runtimeTask 时默认注入高风险验证区块（不误伤原行为）", async () => {
    await new WorkEditorHandler().chat(baseChatParams({ runtimeTask: undefined }))
    const prompt = mocks.execute.mock.calls[0][1] as string
    expect(prompt).toContain("高风险任务验证规则")
  })
})
