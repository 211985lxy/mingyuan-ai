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
  resolveBoundProject,
  startAimGenerationAttempt,
  markAimGenerationRunning,
  markAimGenerationAwaitingInput,
  discardAimGenerationAttempt,
  failAimGenerationAttempt,
  AimGenerationAttemptError,
} = vi.hoisted(() => {
  class AimGenerationAttemptError extends Error {
    code: string
    generationId?: string
    constructor(code: string, message: string, generationId?: string) {
      super(message)
      this.name = "AimGenerationAttemptError"
      this.code = code
      this.generationId = generationId
    }
  }
  return {
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
    resolveBoundProject: vi.fn(async () => ({ id: "project-1", name: "测试项目", status: "active" })),
    startAimGenerationAttempt: vi.fn(async () => ({
      id: "generated-attempt",
      created: true,
      replay: "continue",
    })),
    markAimGenerationRunning: vi.fn(async () => undefined),
    markAimGenerationAwaitingInput: vi.fn(async () => undefined),
    discardAimGenerationAttempt: vi.fn(async () => undefined),
    failAimGenerationAttempt: vi.fn(async () => undefined),
    AimGenerationAttemptError,
  }
})

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest,
  authErrorResponse,
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceDailyBetaLimit,
}))
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))

vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => ({ id: "trace-1" })),
  addAimTraceStep: vi.fn(async () => undefined),
  failAimTrace: vi.fn(async () => undefined),
  finishAimTrace: vi.fn(async () => undefined),
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

vi.mock("@/lib/aim/generation-attempt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aim/generation-attempt")>()
  return {
    ...actual,
    startAimGenerationAttempt,
    markAimGenerationRunning,
    markAimGenerationAwaitingInput,
    discardAimGenerationAttempt,
    failAimGenerationAttempt,
    AimGenerationAttemptError,
  }
})

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
  resolveBoundProject.mockResolvedValue({ id: "project-1", name: "测试项目", status: "active" })
  startAimGenerationAttempt.mockResolvedValue({
    id: "generated-attempt",
    created: true,
    replay: "continue",
  })
})

describe("POST /api/aim/execute（统一入口：理解 → 缺口追问 → 交付）", () => {
  it("asks numbered questions once for key gaps, never about length", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "用户要一篇新文案，但主题受众目标未说明。",
    })

    const response = await executeRequest(baseBody())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.kind).toBe("clarification")
    // 篇幅不在追问范围：只剩主题/受众与内容目标两问
    expect(data.questions).toHaveLength(2)
    expect(data.question).toContain("在动笔前先确认")
    expect(data.question).toContain("1. ")
    expect(data.question).toContain("2. ")
    expect(data.question).not.toMatch(/篇幅|多长|字数/)
    // 关键缺口未确认不先生成
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
    expect(startAimGenerationAttempt).toHaveBeenCalledOnce()
    expect(markAimGenerationAwaitingInput).toHaveBeenCalledWith(expect.objectContaining({
      id: "generated-attempt",
      projectId: "project-1",
    }))
    expect(discardAimGenerationAttempt).not.toHaveBeenCalled()
    expect(data.generationId).toBe("generated-attempt")
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
    expect(executeVerifiedUnifiedDelivery).toHaveBeenCalledWith(expect.objectContaining({
      generationAttemptId: "generated-attempt",
    }))
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
    expect(discardAimGenerationAttempt).toHaveBeenCalledOnce()
  })

  it("passes resolved polish intent into delivery for a full-draft refine", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "用户要求整篇精修并直接给可发布终稿。",
    })
    executeVerifiedUnifiedDelivery.mockResolvedValue({ output: {}, metadata: { runId: "r2" }, spec: {} })

    await executeRequest(baseBody({
      sourceEnvelope: {
        currentUserRequest: "请优化修改，直接给可发布终稿",
        relevantConversation: [],
        referenceMaterials: [{ title: "用户参考原文", content: "这是一篇完整的原始稿件。".repeat(60) }],
      },
    }))

    expect(executeVerifiedUnifiedDelivery).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({ taskKind: "polish_existing" }),
    }))
  })

  it("passes resolved local-edit intent when the user only wants the opener changed", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "只改当前稿开头。",
    })
    executeVerifiedUnifiedDelivery.mockResolvedValue({ output: {}, metadata: { runId: "r3" }, spec: {} })

    await executeRequest(baseBody({
      sourceEnvelope: {
        currentUserRequest: "帮我改一下开头",
        relevantConversation: [],
        currentArtifact: { content: "这是一段已经写好的当前稿内容，长度足够作为完整原稿使用。".repeat(6) },
        referenceMaterials: [],
      },
    }))

    expect(executeVerifiedUnifiedDelivery).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({
        taskKind: "polish_existing",
        modificationScope: "开头",
      }),
    }))
  })

  it("passes benchmark rewrite intent when the user asks to rewrite against a reference", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "参考对标重写一版。",
    })
    executeVerifiedUnifiedDelivery.mockResolvedValue({ output: {}, metadata: { runId: "r4" }, spec: {} })

    await executeRequest(baseBody({
      sourceEnvelope: {
        currentUserRequest: "按对标原文重新写一版",
        relevantConversation: [],
        referenceMaterials: [{ title: "对标原文", content: "对标爆款正文。".repeat(40) }],
      },
    }))

    expect(executeVerifiedUnifiedDelivery).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({ taskKind: "benchmark_rewrite" }),
    }))
  })

  it("passes new-draft intent for a complete new copy request", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "写一篇新口播。",
    })
    executeVerifiedUnifiedDelivery.mockResolvedValue({ output: {}, metadata: { runId: "r5" }, spec: {} })

    await executeRequest(baseBody({
      sourceEnvelope: {
        currentUserRequest: "写一篇讲AI提效的口播，写给中小企业老板，目标是引流获客",
        relevantConversation: [],
        referenceMaterials: [],
      },
    }))

    expect(executeVerifiedUnifiedDelivery).toHaveBeenCalledWith(expect.objectContaining({
      intent: expect.objectContaining({ taskKind: "new_draft" }),
    }))
  })

  it("answers analysis questions even if the LLM wrongly asks to generate", async () => {
    understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "误判成生成。",
    })
    executeVerifiedUnifiedReply.mockResolvedValue("这是故事型结构。")

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
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
    expect(executeVerifiedUnifiedReply).toHaveBeenCalledOnce()
  })

  it("keeps the task recoverable when semantic understanding fails before delivery", async () => {
    understandAimContentTurnWithTrace.mockRejectedValue(new Error("模型暂时不可用"))

    const response = await executeRequest(baseBody({
      attemptId: "web_abcdef0123456789abcdef01",
    }))

    expect(response.status).toBe(500)
    expect(startAimGenerationAttempt).toHaveBeenCalledOnce()
    expect(failAimGenerationAttempt).toHaveBeenCalledWith(expect.objectContaining({
      id: "generated-attempt",
      userId: "user-1",
      projectId: "project-1",
    }))
    expect(discardAimGenerationAttempt).not.toHaveBeenCalled()
    const data = await response.json()
    expect(data.generationId).toBe("generated-attempt")
  })

  it("replays a completed attempt with the stored copy and does not call the model", async () => {
    startAimGenerationAttempt.mockResolvedValueOnce({
      id: "web_0123456789abcdef01234567",
      created: false,
      replay: "completed",
      results: [{ format: "video_script", content: "成稿正文，已经写好。", wordCount: 10 }],
      knowledgeUsed: [],
    })

    const response = await executeRequest(baseBody({
      attemptId: "web_0123456789abcdef01234567",
    }))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.kind).toBe("deliverable")
    expect(data.generationId).toBe("web_0123456789abcdef01234567")
    expect(data.results).toEqual([
      { format: "video_script", content: "成稿正文，已经写好。", wordCount: 10 },
    ])
    expect(understandAimContentTurnWithTrace).not.toHaveBeenCalled()
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
  })

  it("replays a failed attempt with the original error code and does not call the model", async () => {
    startAimGenerationAttempt.mockResolvedValueOnce({
      id: "web_0123456789abcdef01234567",
      created: false,
      replay: "failed",
      errorCode: "MODEL_TIMEOUT",
      errorMessage: "模型服务暂时未能返回完整正文，素材和要求已保留。点击重试会自动更换线路。",
    })

    const response = await executeRequest(baseBody({
      attemptId: "web_0123456789abcdef01234567",
    }))
    const data = await response.json()

    expect(response.status).toBe(504)
    expect(data.code).toBe("MODEL_TIMEOUT")
    expect(data.generationId).toBe("web_0123456789abcdef01234567")
    expect(data.error).toContain("素材和要求已保留")
    expect(understandAimContentTurnWithTrace).not.toHaveBeenCalled()
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
  })

  it("returns GENERATION_IN_PROGRESS for the same attempt without calling the model", async () => {
    startAimGenerationAttempt.mockRejectedValueOnce(
      new AimGenerationAttemptError("GENERATION_IN_PROGRESS", "同一生成任务仍在执行中", "web_0123456789abcdef01234567"),
    )

    const response = await executeRequest(baseBody({
      attemptId: "web_0123456789abcdef01234567",
    }))
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.code).toBe("GENERATION_IN_PROGRESS")
    expect(understandAimContentTurnWithTrace).not.toHaveBeenCalled()
    expect(executeVerifiedUnifiedDelivery).not.toHaveBeenCalled()
  })
})
