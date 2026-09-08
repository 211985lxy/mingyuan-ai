import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 批1（函数拼接型 prompt 资产化）迁移前行为快照。
 *
 * 目的：证明迁移（prompt 文案搬入 prompt registry seed v1 + 调用点改为
 * registry get + fillPromptTemplate）前后，六个文件产出的 prompt **逐字节一致**。
 *
 * - 快照生成：UPDATE_PROMPT_BATCH1_SNAPSHOT=1 vitest run 本文件（在迁移前的
 *   commit 上执行一次，把当时各 builder 的真实输出写进 fixtures JSON）。
 * - 迁移核验：迁移 commit 上默认（比对模式）跑本文件，任何 diff 即失败。
 * - 快照内容属于「迁移前基线」，之后业务改 prompt 应改 seed/DB 版本，
 *   而不是回写本快照（除非是有意的 prompt 变更，需同步评审）。
 */

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  executeGenerate: vi.fn(),
  buildWorkflowContext: vi.fn(() => ""),
  complete: vi.fn(),
  detectAITaste: vi.fn(),
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
  ensureContentCreationTrace: vi.fn((c: string) => c),
  CONTENT_CREATION_TRACE_RULE: "",
  executeGenerateLLMWithBenchmarkRetry: mocks.executeGenerate,
}))

vi.mock("@/lib/llm/client", () => ({
  LLMClient: {
    shared: () => ({ complete: mocks.complete }),
    reset: vi.fn(),
  },
}))

vi.mock("@/lib/ai-taste-detector", () => ({
  detectAITaste: (...args: unknown[]) => mocks.detectAITaste(...(args as [])),
}))

// 迁移后 registry 首查会后台回源 DB；单测环境给个空替身，避免真实 prisma 副作用。
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { WorkEditorHandler } = await import("@/lib/aim-agent-work-editor")
const {
  buildContentReviewChatPrompt,
  buildContentReviewGeneratePrompt,
  buildContentEditorRevisePrompt,
} = await import("@/lib/aim-agent-content-review-prompts")
const {
  buildContentRetroChatPrompt,
  buildContentRetroGeneratePrompt,
} = await import("@/lib/aim-agent-content-retro-prompts")
const {
  buildImitateMessages,
  buildProofreadMessages,
  buildPolishMessages,
} = await import("@/lib/aim/services/script-polish-prompts")
const {
  understandAimContentTurn,
} = await import("@/lib/aim/semantic-task-understanding")
const { runQualityCheck, runQualityGateWithRewrite } = await import("@/lib/quality-gate")

const SNAPSHOT_PATH = resolve(__dirname, "__fixtures__/prompt-batch1-snapshot.json")

const observed: Record<string, string> = {}

function observe(name: string, value: string | Array<{ role: string; content: string }>) {
  observed[name] = typeof value === "string" ? value : JSON.stringify(value)
}

// ── work_editor ───────────────────────────────────────────────────────────

const chatBase = {
  userId: "u1",
  knowledgeBlock: "",
  conversationBlock: "",
  methodologyBlock: "",
  businessDiagnosisBlock: "",
  ipWikiBlock: "",
} as Record<string, unknown>

function chatParams(overrides: Record<string, unknown>) {
  return {
    ...chatBase,
    messages: [{ role: "user", content: "把这篇润一下" }],
    ...overrides,
  } as Parameters<InstanceType<typeof WorkEditorHandler>["chat"]>[0]
}

async function snapWorkEditorChat() {
  const handler = new WorkEditorHandler()

  mocks.buildWorkflowContext.mockReturnValue("")
  await handler.chat(chatParams({ runtimeTask: "light_edit" }))
  observe("workEditor.chat.light_edit", mocks.execute.mock.calls.at(-1)?.[1] as string)

  mocks.buildWorkflowContext.mockReturnValue("【任务单】按爆款结构重写")
  await handler.chat(
    chatParams({
      runtimeTask: "rewrite_copy",
      knowledgeBlock: "【知识】罗老板卖供暖设备",
      conversationBlock: "【对话】用户：上次那篇",
      methodologyBlock: "【方法论】钩子三段式",
      ipWikiBlock: "【IPwiki】罗永浩式直率",
    }),
  )
  observe("workEditor.chat.full", mocks.execute.mock.calls.at(-1)?.[1] as string)
  mocks.buildWorkflowContext.mockReturnValue("")
}

async function snapWorkEditorGenerate() {
  const handler = new WorkEditorHandler()

  mocks.executeGenerate.mockReset().mockResolvedValue({
    completion: { content: "润色后成稿" },
    parsed: { raw_copy: "润色后成稿" },
    safetyWarning: null,
  })

  await handler.generate({
    userId: "u1",
    rawInput: "请把这篇开头改得更有冲突感：……原文……",
    targetFormats: ["raw_copy"],
    knowledgeBlock: "【知识】罗老板卖供暖设备",
    methodologyBlock: "【方法论】钩子三段式",
    eventStorytellingBlock: "【事件叙事】供暖改造事件",
    ipWikiBlock: "【IPwiki】罗永浩式直率",
    runtimeTask: "light_edit",
  } as Parameters<InstanceType<typeof WorkEditorHandler>["generate"]>[0])
  observe("workEditor.generate.full.light_edit", mocks.executeGenerate.mock.calls.at(-1)?.[1] as string)
  observe("workEditor.generate.userPrompt.full", mocks.executeGenerate.mock.calls.at(-1)?.[2] as string)

  await handler.generate({
    userId: "u1",
    rawInput: "这篇文章润色一下",
    targetFormats: ["raw_copy"],
    knowledgeBlock: "  ",
    methodologyBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock: "",
    runtimeTask: undefined,
  } as unknown as Parameters<InstanceType<typeof WorkEditorHandler>["generate"]>[0])
  observe("workEditor.generate.fallback", mocks.executeGenerate.mock.calls.at(-1)?.[1] as string)
  observe("workEditor.generate.userPrompt.fallback", mocks.executeGenerate.mock.calls.at(-1)?.[2] as string)
}

// ── content_review ────────────────────────────────────────────────────────

function snapContentReview() {
  observe("contentReview.chat", buildContentReviewChatPrompt("【知识】质检背景块"))
  observe("contentReview.generate", buildContentReviewGeneratePrompt("【知识】质检背景块"))
  observe("contentReview.editorRevise", buildContentEditorRevisePrompt("【知识】质检背景块"))
}

// ── content_retro ─────────────────────────────────────────────────────────

const OUTCOME_BLOCK = "【发布结果】播放 1200，线索 1 条"

function snapContentRetro() {
  observe("contentRetro.chat.withOutcome", buildContentRetroChatPrompt({
    contextBlock: "【知识】复盘背景块",
    publishOutcomeBlock: OUTCOME_BLOCK,
  }))
  observe("contentRetro.chat.noOutcome", buildContentRetroChatPrompt({
    contextBlock: "【知识】复盘背景块",
    publishOutcomeBlock: undefined,
  }))
  observe("contentRetro.generate.withOutcome", buildContentRetroGeneratePrompt({
    knowledgeBlock: "【知识】复盘背景块",
    publishOutcomeBlock: OUTCOME_BLOCK,
  }))
  observe("contentRetro.generate.noOutcome", buildContentRetroGeneratePrompt({
    knowledgeBlock: "【知识】复盘背景块",
    publishOutcomeBlock: "   ",
  }))
}

// ── script_polish ─────────────────────────────────────────────────────────

function snapScriptPolish() {
  observe("scriptPolish.imitate.withTopic", JSON.stringify(buildImitateMessages({
    contextBlock: "【知识】仿写背景块",
    styleOverrideBlock: "【风格档案】短句、有底气",
    viralSourceText: "对标爆款原文……",
    content: "我的草稿……",
    topicTitle: "供暖改造避坑",
  })))
  observe("scriptPolish.imitate.noTopic", JSON.stringify(buildImitateMessages({
    contextBlock: "",
    styleOverrideBlock: "",
    viralSourceText: "对标爆款原文2",
    content: "我的草稿2",
    topicTitle: null,
  })))
  observe("scriptPolish.proofread", JSON.stringify(buildProofreadMessages("待校对文案原文")))
  observe("scriptPolish.polish.multiInstructions", JSON.stringify(buildPolishMessages({
    content: "待润色口播稿",
    contextSection: "【上下文】选题背景",
    polishInstructions: ["【AI味消除——最高优先级】", "1. 删禁用词", "【编辑质量提升】", "1. 删空话"],
  })))
  observe("scriptPolish.polish.noContext", JSON.stringify(buildPolishMessages({
    content: "待润色口播稿2",
    contextSection: "",
    polishInstructions: ["【综合润色】", "优化口语化表达"],
  })))
}

// ── semantic_task ─────────────────────────────────────────────────────────

async function snapSemanticTask() {
  const envelope = {
    currentUserRequest: "帮我起个标题",
    relevantConversation: [],
    referenceMaterials: [],
  }
  mocks.complete.mockReset()
  mocks.complete.mockResolvedValue({
    content: "[[AIM_HANDLING:deliver]]\n[[AIM_TASK_BRIEF]]起标题[[/AIM_TASK_BRIEF]]",
  })
  await understandAimContentTurn({ envelope, complete: mocks.complete })
  observe("semanticTask.understanding.system", mocks.complete.mock.calls[0]?.[0] as string)
  observe("semanticTask.understanding.user", mocks.complete.mock.calls[0]?.[1] as string)

  // 触发修复链路：第一次输出协议不完整 → REPAIR system prompt
  mocks.complete
    .mockResolvedValueOnce({ content: "（模型输出坏掉了）" })
    .mockResolvedValueOnce({
      content: "[[AIM_HANDLING:respond]]\n[[AIM_TASK_BRIEF]]修复后[[/AIM_TASK_BRIEF]]",
    })
  await understandAimContentTurn({ envelope, complete: mocks.complete })
  observe("semanticTask.repair.system", mocks.complete.mock.calls[1]?.[0] as string)
  observe("semanticTask.repair.user", mocks.complete.mock.calls[1]?.[1] as string)
}

// ── quality_gate ──────────────────────────────────────────────────────────

const gateInput = {
  content: "这是被测文案正文。",
  topicTitle: "测试选题",
  openingType: "反差开头",
  structure: "对比结构",
  endingType: "行动号召",
  persona: {
    roleType: "专家",
    oneLiner: "擅长拆解",
    toneOfVoice: "接地气",
  },
}

const PASS_JSON = JSON.stringify({
  editorial: { score: 8, feedback: "编辑质量良好", details: "结构清晰" },
  attraction: { score: 9, feedback: "吸引力强", details: "钩子明显" },
  logic: { score: 8, feedback: "逻辑一致", details: "论据匹配" },
})

function mockGateLlm() {
  mocks.complete.mockReset()
  return mocks.complete
}

function passTaste(score = 9) {
  mocks.detectAITaste.mockReset().mockReturnValue({
    score,
    forbiddenWordHits: [],
    patternHits: [],
    suggestions: ["AI 味检测通过"],
  })
}

async function snapQualityGate() {
  // 评估模板 + 评估 system
  mockGateLlm()
  mocks.complete.mockResolvedValueOnce({ content: PASS_JSON })
  passTaste()
  await runQualityCheck(gateInput)
  observe("qualityGate.evaluation.system", mocks.complete.mock.calls[0]?.[0].messages[0].content as string)
  observe("qualityGate.evaluation.user", mocks.complete.mock.calls[0]?.[0].messages[1].content as string)

  const failJson = (dim: Record<string, unknown>) => JSON.stringify({
    editorial: dim.editorial ?? { score: 8, feedback: "ok", details: "d" },
    attraction: dim.attraction ?? { score: 9, feedback: "ok", details: "d" },
    logic: dim.logic ?? { score: 8, feedback: "ok", details: "d" },
  })

  // 靶向：编辑质量（editorial）
  mockGateLlm()
  mocks.complete.mockResolvedValueOnce({ content: failJson({ editorial: { score: 3, feedback: "语气散", details: "句式乱" } }) })
  mocks.complete.mockResolvedValueOnce({ content: "重写后的成稿" })
  mocks.complete.mockResolvedValueOnce({ content: PASS_JSON })
  passTaste()
  await runQualityGateWithRewrite(gateInput)
  observe("qualityGate.editorialRewrite.system", mocks.complete.mock.calls[1]?.[0].messages[0].content as string)
  observe("qualityGate.editorialRewrite.user", mocks.complete.mock.calls[1]?.[0].messages[1].content as string)

  // 靶向：开头钩子（attraction）
  mockGateLlm()
  mocks.complete.mockResolvedValueOnce({ content: failJson({ attraction: { score: 3, feedback: "开头平", details: "无钩子" } }) })
  mocks.complete.mockResolvedValueOnce({ content: "重写后的成稿" })
  mocks.complete.mockResolvedValueOnce({ content: PASS_JSON })
  passTaste()
  await runQualityGateWithRewrite(gateInput)
  observe("qualityGate.hookRewrite.user", mocks.complete.mock.calls[1]?.[0].messages[1].content as string)

  // 靶向：逻辑（logic）
  mockGateLlm()
  mocks.complete.mockResolvedValueOnce({ content: failJson({ logic: { score: 3, feedback: "论证弱", details: "无论据" } }) })
  mocks.complete.mockResolvedValueOnce({ content: "重写后的成稿" })
  mocks.complete.mockResolvedValueOnce({ content: PASS_JSON })
  passTaste()
  await runQualityGateWithRewrite(gateInput)
  observe("qualityGate.logicRewrite.user", mocks.complete.mock.calls[1]?.[0].messages[1].content as string)

  // 靶向：AI 味（aiTaste，detect 第一次打分低触发 ORAL，重写后恢复高分收敛）
  mockGateLlm()
  mocks.complete.mockResolvedValueOnce({ content: PASS_JSON })
  mocks.complete.mockResolvedValueOnce({ content: "重写后的成稿" })
  mocks.complete.mockResolvedValueOnce({ content: PASS_JSON })
  let tasteCall = 0
  mocks.detectAITaste.mockReset().mockImplementation(() => {
    tasteCall++
    return tasteCall === 1
      ? { score: 3, forbiddenWordHits: ["赋能", "抓手"], patternHits: ["排比三连"], suggestions: ["删除书面腔"] }
      : { score: 9, forbiddenWordHits: [], patternHits: [], suggestions: ["AI 味检测通过"] }
  })
  await runQualityGateWithRewrite(gateInput)
  observe("qualityGate.oralRewrite.user", mocks.complete.mock.calls[1]?.[0].messages[1].content as string)
}

// ── 汇总 ──────────────────────────────────────────────────────────────────

describe("批1 prompt 迁移前行为快照", () => {
  beforeEach(() => {
    mocks.execute.mockReset()
    mocks.executeGenerate.mockReset()
  })

  it("捕获六个文件全部 prompt 输出并与基线逐字节比对", async () => {
    await snapWorkEditorChat()
    await snapWorkEditorGenerate()
    snapContentReview()
    snapContentRetro()
    snapScriptPolish()
    await snapSemanticTask()
    await snapQualityGate()

    expect(Object.keys(observed).length).toBeGreaterThanOrEqual(20)

    if (process.env.UPDATE_PROMPT_BATCH1_SNAPSHOT) {
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
