import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 批 3 / WP-1.2：三个尚未迁注册表的 handler 行为快照。
 * 生成：UPDATE_PROMPT_BATCH3_SNAPSHOT=1 vitest run 本文件
 */

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executeGenerate: vi.fn(),
  buildWorkflowContext: vi.fn(() => ""),
  buildCompactWorkflowContext: vi.fn(() => ""),
}))

vi.mock("@/lib/aim-agent-model", () => ({
  executeChatLLM: mocks.execute,
  executeChatLLMStream: mocks.execute,
  executeGenerateLLM: mocks.executeGenerate,
}))

vi.mock("@/lib/aim-harness/persistence", () => ({
  saveAimGenerationRecord: vi.fn().mockResolvedValue({ id: "gen-1", knowledgeUsed: [] }),
}))

vi.mock("@/lib/aim-generation-prompts", () => ({
  buildWorkflowContext: mocks.buildWorkflowContext,
  buildCompactWorkflowContext: mocks.buildCompactWorkflowContext,
  CONTENT_CREATION_TRACE_RULE: "[[TRACE]]",
  ensureContentCreationTrace: vi.fn((content: string) => content),
  executeGenerateLLMWithBenchmarkRetry: mocks.executeGenerate,
}))

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { FreeCopywriterHandler } = await import("@/lib/aim-agent-free-copywriter")
const { BusinessSystemDiagnosisHandler } = await import("@/lib/aim-agent-business-system-diagnosis")
const { BusinessDiagnosisHandler } = await import("@/lib/aim-agent-business-diagnosis")

const SNAPSHOT_PATH = resolve(__dirname, "__fixtures__/prompt-batch3-handlers-snapshot.json")
const observed: Record<string, string> = {}

function observe(name: string, value: string) {
  observed[name] = value
}

const chatBase = {
  userId: "u1",
  knowledgeBlock: "",
  conversationBlock: "",
  methodologyBlock: "",
  businessDiagnosisBlock: "",
  ipWikiBlock: "",
  selectedMethodologyBlock: "",
}

function chatParams(overrides: Record<string, unknown> = {}) {
  return {
    ...chatBase,
    messages: [{ role: "user", content: "帮我看一下" }],
    ...overrides,
  } as never
}

function genContext(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    rawInput: "按框架写一篇口播",
    targetFormats: ["raw_copy"],
    knowledgeBlock: "",
    methodologyBlock: "",
    selectedMethodologyBlock: "",
    businessDiagnosisBlock: "",
    viralStructureBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock: "",
    retrievedEntries: [],
    retrievedSource: "raw",
    knowledgeStrategy: "deep",
    ...overrides,
  } as never
}

function lastChatSystem() {
  return mocks.execute.mock.calls.at(-1)?.[1] as string
}

function lastGeneratePair() {
  const call = mocks.executeGenerate.mock.calls.at(-1)
  return { system: call?.[1] as string, user: call?.[2] as string }
}

describe("批3 handler prompt 快照", () => {
  beforeEach(() => {
    mocks.execute.mockReset()
    mocks.executeGenerate.mockReset().mockResolvedValue({
      completion: { content: "成稿" },
      parsed: { raw_copy: "成稿" },
      content: "报告",
    })
    mocks.buildWorkflowContext.mockReturnValue("")
    mocks.buildCompactWorkflowContext.mockReturnValue("")
  })

  it("捕获三个 handler 的 chat/generate prompt 并与基线逐字节比对", async () => {
    const copywriter = new FreeCopywriterHandler()
    await copywriter.chat(chatParams())
    observe("freeCopywriter.chat.empty", lastChatSystem())

    mocks.buildCompactWorkflowContext.mockReturnValue("【任务单】轻改")
    await copywriter.chat(chatParams({
      runtimeTask: "light_edit",
      knowledgeBlock: "【知识】供暖改造",
      ipWikiBlock: "【IPwiki】直率",
    }))
    observe("freeCopywriter.chat.light_edit", lastChatSystem())

    await copywriter.generate(genContext({
      agentId: "free_copywriter",
      polishInstruction: "只修改开头",
      runtimeTask: "light_edit",
      ipWikiBlock: "【IPwiki】直率",
    }))
    const copyGen = lastGeneratePair()
    observe("freeCopywriter.generate.system", copyGen.system)
    observe("freeCopywriter.generate.user", copyGen.user)
    mocks.buildCompactWorkflowContext.mockReturnValue("")

    const systemDiag = new BusinessSystemDiagnosisHandler()
    await systemDiag.chat(chatParams({
      knowledgeBlock: "【知识】年营收 800 万",
      businessDiagnosisBlock: "【诊断法】问诊消解漏斗",
    }))
    observe("businessSystemDiagnosis.chat", lastChatSystem())

    mocks.buildWorkflowContext.mockReturnValue("【任务单】体检")
    await systemDiag.generate(genContext({
      agentId: "business_system_diagnosis",
      knowledgeBlock: "【知识】年营收 800 万",
      businessDiagnosisBlock: "【诊断法】问诊消解漏斗",
    }))
    const sysGen = lastGeneratePair()
    observe("businessSystemDiagnosis.generate.system", sysGen.system)
    observe("businessSystemDiagnosis.generate.user", sysGen.user)

    const positioning = new BusinessDiagnosisHandler()
    await positioning.chat(chatParams({
      knowledgeBlock: "【知识】老板经历",
      methodologyBlock: "【方法论】定位公式",
    }))
    observe("businessDiagnosis.chat", lastChatSystem())

    await positioning.generate(genContext({
      agentId: "business_diagnosis",
      knowledgeBlock: "【知识】老板经历",
      methodologyBlock: "【方法论】定位公式",
    }))
    const posGen = lastGeneratePair()
    observe("businessDiagnosis.generate.system", posGen.system)
    observe("businessDiagnosis.generate.user", posGen.user)

    expect(Object.keys(observed).length).toBeGreaterThanOrEqual(8)

    if (process.env.UPDATE_PROMPT_BATCH3_SNAPSHOT) {
      mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true })
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(observed, null, 2) + "\n", "utf8")
      return
    }

    const baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, string>
    for (const [name, value] of Object.entries(baseline)) {
      expect(observed[name], `快照案例 ${name} 缺失`).toBeDefined()
      expect(value, `快照案例 ${name} 与迁移前基线不一致`).toBe(observed[name])
    }
    expect(Object.keys(observed).sort()).toEqual(Object.keys(baseline).sort())
  })
})
