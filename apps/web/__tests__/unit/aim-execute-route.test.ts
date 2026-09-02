import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateRequest,
  authErrorResponse,
  enforceDailyBetaLimit,
  understandAimContentTurnWithTrace,
  executeVerifiedUnifiedDelivery,
  executeVerifiedUnifiedReply,
  serializeAimGenerationRun,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  enforceDailyBetaLimit: vi.fn(async () => null),
  understandAimContentTurnWithTrace: vi.fn(),
  executeVerifiedUnifiedDelivery: vi.fn(),
  executeVerifiedUnifiedReply: vi.fn(),
  serializeAimGenerationRun: vi.fn(() => ({
    id: "generation-1",
    results: [{ format: "video_script", content: "成稿正文。", wordCount: 6 }],
  })),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest,
  authErrorResponse,
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceDailyBetaLimit,
}))

vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => ({ id: "trace-1" })),
  addAimTraceStep: vi.fn(async () => undefined),
  failAimTrace: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace, _key, _label, fn) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
}))

vi.mock("@/lib/aim/semantic-task-understanding", () => ({
  understandAimContentTurnWithTrace,
}))

vi.mock("@/lib/aim/services/unified-content-execution", () => ({
  executeVerifiedUnifiedDelivery,
  executeVerifiedUnifiedReply,
}))

vi.mock("@/lib/aim/services/generate-request", () => ({
  serializeAimGenerationRun,
}))

import { POST } from "@/app/api/aim/execute/route"

function executeRequest(body: unknown) {
  return POST(new NextRequest("http://localhost/api/aim/execute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }))
}

function baseBody(overrides: Record<string, unknown> = {}) {
  return {
    agentId: "content_producer",
    sourceEnvelope: {
      currentUserRequest: "帮我写个文案",
      relevantConversation: [],
      referenceMaterials: [],
    },
    targetFormats: ["video_script"],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/aim/execute（统一入口：理解 → 缺口追问 → 交付）", () => {
  it("asks up to three numbered questions once when a new draft lacks key fields", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "用户要一篇新文案，但主题受众目标篇幅都未说明。",
    })

    const response = await executeRequest(baseBody())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.kind).toBe("clarification")
    expect(data.questions).toHaveLength(3)
    expect(data.question).toContain("在动笔前先确认")
    expect(data.question).toContain("1. ")
    expect(data.question).toContain("2. ")
    expect(data.question).toContain("3. ")
    // 关键缺口未确认不先生成
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
  })

  it("does not ask again when the user is answering a previous clarification", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "用户补充了篇幅：2分钟、400到550字，直接开写。",
    })
    executeVerifiedUnifiedDelivery.mockResolvedValue({ output: {}, metadata: { runId: "r1" }, spec: {} })

    const response = await executeRequest(baseBody({
      sourceEnvelope: {
        currentUserRequest: "2分钟，400到550字，写给实体店老板",
        relevantConversation: [
          { role: "user", content: "帮我写个文案" },
          { role: "assistant", content: "在动笔前先确认 3 件事（直接按编号回答即可）：\n1. 这篇内容写什么主题、给谁看？\n2. 内容目标是什么？\n3. 篇幅要多长？" },
        ],
        referenceMaterials: [],
      },
    }))
    const data = await response.json()

    expect(data.kind).toBe("deliverable")
    expect(executeVerifiedUnifiedDelivery).toHaveBeenCalledOnce()
  })

  it("generates directly when a complete original draft covers volume and scope (894字场景)", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "用户要求整篇精修并直接给可发布终稿。",
    })
    executeVerifiedUnifiedDelivery.mockResolvedValue({ output: {}, metadata: { runId: "r2" }, spec: {} })

    const response = await executeRequest(baseBody({
      sourceEnvelope: {
        currentUserRequest: "请优化修改，直接给可发布终稿",
        relevantConversation: [],
        referenceMaterials: [{ title: "用户参考原文", content: "这是一篇完整的原始稿件。".repeat(60) }],
      },
    }))
    const data = await response.json()

    expect(data.kind).toBe("deliverable")
    expect(executeVerifiedUnifiedDelivery).toHaveBeenCalledOnce()
  })

  it("merges LLM clarification with deterministic gaps, deduped and capped at three", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "clarify",
      brief: "新稿信息不足。",
      clarificationQuestions: ["这篇是全新一稿，还是继续改上一篇？", "主要给谁看？"],
    })

    const response = await executeRequest(baseBody())
    const data = await response.json()

    expect(data.kind).toBe("clarification")
    expect(data.questions).toHaveLength(3)
    // LLM 的问题保留在前（新任务归属、受众），确定性缺口按字段去重后补位（主题）
    expect(data.questions[0]).toContain("继续改上一篇")
    expect(data.questions.some((question: string) => /给谁看/.test(question))).toBe(true)
    expect(data.questions.some((question: string) => /主题/.test(question))).toBe(true)
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
  })

  it("returns a plain reply for analysis questions without touching delivery", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "respond",
      brief: "用户在问当前稿的结构。",
    })
    executeVerifiedUnifiedReply.mockResolvedValue("这篇是故事型结构。")

    const response = await executeRequest(baseBody({
      sourceEnvelope: {
        currentUserRequest: "这个文案是什么结构？",
        relevantConversation: [],
        currentArtifact: { content: "参考正文" },
        referenceMaterials: [],
      },
    }))
    const data = await response.json()

    expect(data.kind).toBe("reply")
    expect(data.content).toContain("故事型")
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
  })
})
