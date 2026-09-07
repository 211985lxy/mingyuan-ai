import { beforeEach, describe, expect, it, vi } from "vitest"

import { mapResolvedIntentToRuntimeTask } from "@/lib/aim/execute-turn-intent-gate"
import { resolveUserIntentFromEnvelope, type ResolvedUserIntent } from "@/lib/aim/resolved-user-intent"
import { executeVerifiedUnifiedDelivery, executeVerifiedUnifiedReply } from "@/lib/aim/services/unified-content-execution"

const { resolveBoundProject, executeAimRun, addAimTraceStep } = vi.hoisted(() => ({
  resolveBoundProject: vi.fn(async () => ({ id: "project-1", name: "测试项目", status: "active" })),
  executeAimRun: vi.fn(async (_request: unknown) => ({
    output: { results: [] },
    metadata: { runId: "run-1", degraded: false },
    spec: {},
  })),
  addAimTraceStep: vi.fn(async () => undefined),
}))

vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject,
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
}))

vi.mock("@/lib/aim-harness/runtime", () => ({
  executeAimRun,
}))

vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => ({ id: "trace-1" })),
  addAimTraceStep,
  failAimTrace: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace: unknown, _key: unknown, _label: unknown, fn: () => unknown) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
  logAimProjectContextRejection: vi.fn(async () => undefined),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: { aimGeneration: { findFirst: vi.fn() } },
}))

function intentFrom(request: string, extras: {
  materials?: Array<{ title: string; content: string }>
  currentArtifact?: string
} = {}): ResolvedUserIntent {
  return resolveUserIntentFromEnvelope({
    currentUserRequest: request,
    relevantConversation: [],
    currentArtifact: extras.currentArtifact ? { content: extras.currentArtifact } : undefined,
    referenceMaterials: extras.materials ?? [],
  })
}

describe("unified content execution", () => {
  it("returns a verified answer without creating a deliverable", async () => {
    const complete = vi.fn().mockResolvedValue({
      content: "===FORMAT:raw_copy===\n这是‘冲突—原因—行动’结构。",
    })
    const verify = vi.fn().mockResolvedValue({ passed: true })

    await expect(executeVerifiedUnifiedReply({
      userId: "user-1",
      parsed: {
        agentId: "content_producer",
        sourceEnvelope: {
          currentUserRequest: "这篇文案是什么结构？",
          relevantConversation: [],
          currentArtifact: { content: "先给冲突，再解释原因，最后行动。" },
          referenceMaterials: [],
        },
        targetFormats: ["video_script"],
      },
      understanding: { handling: "respond", brief: "回答当前文案的结构" },
      ports: { complete, verify },
    })).resolves.toBe("这是‘冲突—原因—行动’结构。")
    expect(complete).toHaveBeenCalledOnce()
    expect(verify).toHaveBeenCalledOnce()
  })

  it("fails closed instead of returning an unverified answer", async () => {
    const complete = vi.fn().mockResolvedValue({ content: "===FORMAT:raw_copy===\n任务复述" })
    const verify = vi.fn().mockResolvedValue({ passed: false, gaps: ["没有回答问题"] })

    await expect(executeVerifiedUnifiedReply({
      userId: "user-1",
      parsed: {
        sourceEnvelope: {
          currentUserRequest: "这篇文案是什么结构？",
          relevantConversation: [],
          referenceMaterials: [],
        },
        targetFormats: ["video_script"],
      },
      understanding: { handling: "respond", brief: "回答结构" },
      ports: { complete, verify },
    })).rejects.toThrow("连续修正后仍未完成当前要求")
    expect(complete).toHaveBeenCalledTimes(3)
  })
})

describe("mapResolvedIntentToRuntimeTask", () => {
  it("maps each structured intent to the runtime task that actually controls generation", () => {
    expect(mapResolvedIntentToRuntimeTask(intentFrom("写一篇讲AI提效的口播，写给中小企业老板，目标是引流获客")))
      .toBe("new_copy")
    expect(mapResolvedIntentToRuntimeTask(intentFrom("按对标原文重新写一版", {
      materials: [{ title: "对标原文", content: "对标爆款正文。".repeat(40) }],
    }))).toBe("rewrite_copy")
    expect(mapResolvedIntentToRuntimeTask(intentFrom("仿写这条对标文案", {
      materials: [{ title: "对标原文", content: "样本。".repeat(40) }],
    }))).toBe("rewrite_copy")
    expect(mapResolvedIntentToRuntimeTask(intentFrom("请优化修改，直接给可发布终稿", {
      materials: [{ title: "用户参考原文", content: "这是一篇完整的原始稿件。".repeat(60) }],
    }))).toBe("rewrite_copy")
    expect(mapResolvedIntentToRuntimeTask(intentFrom("帮我改一下开头", {
      currentArtifact: "这是一段已经写好的当前稿内容，长度足够作为完整原稿使用。".repeat(6),
    }))).toBe("light_edit")
    expect(mapResolvedIntentToRuntimeTask(intentFrom("批量复刻这些对标文案，生成5条", {
      materials: [{ title: "对标原文", content: "样本。".repeat(60) }],
    }))).toBe("new_copy")
    expect(mapResolvedIntentToRuntimeTask(intentFrom("优化开头，给3条候选", {
      currentArtifact: "当前稿开头偏弱，需要替换。".repeat(8),
    }))).toBe("light_edit")
  })

  it("refuses to map analysis questions into a generate runtime task", () => {
    expect(() => mapResolvedIntentToRuntimeTask(intentFrom("这个文案是什么结构？", {
      currentArtifact: "先给冲突，再解释原因。",
    }))).toThrow(/answer_question|不得进入 generate/)
  })
})

describe("executeVerifiedUnifiedDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resolveBoundProject.mockResolvedValue({ id: "project-1", name: "测试项目", status: "active" })
  })

  it("does not hardcode polish/rewrite as new_copy and forwards the resolved intent", async () => {
    const request = "请优化修改，直接给可发布终稿"
    const envelope = {
      currentUserRequest: request,
      relevantConversation: [],
      referenceMaterials: [{ title: "用户参考原文", content: "这是一篇完整的原始稿件。".repeat(60) }],
    }
    const intent = resolveUserIntentFromEnvelope(envelope)

    await executeVerifiedUnifiedDelivery({
      userId: "user-1",
      parsed: {
        agentId: "content_producer",
        projectId: "project-1",
        sourceEnvelope: envelope,
        targetFormats: ["video_script"],
      },
      understanding: { handling: "deliver", brief: "整篇精修当前原稿" },
      intent,
    })

    expect(executeAimRun).toHaveBeenCalledOnce()
    const runRequest = executeAimRun.mock.calls[0][0] as {
      runtimeTask: string
      rawInput: string
      unifiedContentExecution: { intent: ResolvedUserIntent; envelope: { currentUserRequest: string } }
    }
    expect(runRequest.runtimeTask).toBe("rewrite_copy")
    expect(runRequest.runtimeTask).not.toBe("new_copy")
    expect(runRequest.unifiedContentExecution.intent).toEqual(intent)
    expect(runRequest.rawInput).toBe(envelope.currentUserRequest)
  })

  it("maps a local opener polish to light_edit instead of new_copy", async () => {
    const request = "帮我改一下开头"
    const envelope = {
      currentUserRequest: request,
      relevantConversation: [],
      currentArtifact: { content: "这是一段已经写好的当前稿内容，长度足够作为完整原稿使用。".repeat(6) },
      referenceMaterials: [],
    }

    await executeVerifiedUnifiedDelivery({
      userId: "user-1",
      parsed: {
        agentId: "content_producer",
        projectId: "project-1",
        sourceEnvelope: envelope,
        targetFormats: ["video_script"],
      },
      understanding: { handling: "deliver", brief: "只改开头" },
      intent: resolveUserIntentFromEnvelope(envelope),
    })

    const runRequest = executeAimRun.mock.calls[0][0] as { runtimeTask: string }
    expect(runRequest.runtimeTask).toBe("light_edit")
  })
})
