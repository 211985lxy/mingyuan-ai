import { describe, expect, it } from "vitest"

import { aimExecuteBodySchema, aimGenerateBodySchema } from "@/features/aim/contracts/api"
import { buildExecuteTurnRequest } from "@/hooks/aim-generation-delivery-flow"
import { buildAimEntryRequest } from "@/hooks/use-aim-generation-actions"

function mockInput() {
  return {
    selectedAgentId: "content_producer",
    projectEnabled: false,
    selectedProjectId: "",
    agent: { defaultFormats: ["raw_copy"] },
    selectedMethodologyProfileIds: [],
    editorText: "",
    editorFormat: undefined,
    sourceOriginalText: "",
    sourceAnalysisText: "",
  } as unknown as Parameters<typeof buildExecuteTurnRequest>[0]
}

/** 覆盖两个 builder 都会读到的字段（读到缺省字段亦应 undefined 安全）。 */
function mockEntryInput() {
  return {
    selectedAgentId: "content_producer",
    selectedProjectId: "",
    projectEnabled: false,
    currentWorkflowStage: "content",
    contentAction: null,
    workflowBrief: null,
    agent: {
      id: "content_producer",
      title: "文案创作",
      primaryActionLabel: "创作",
      defaultFormats: ["raw_copy"],
      defaultInstruction: "",
    },
    agentModule: undefined,
    selectedMethodologyProfileIds: [],
    editorText: "",
    editorFormat: undefined,
    sourceOriginalText: "",
    sourceAnalysisText: "",
    sourceTopicTitle: "",
    sourceTopicRationale: "",
    selectedTopicIndex: -1,
    messages: [],
  } as unknown as Parameters<typeof buildAimEntryRequest>[0]
}

describe("execute 入口 traceId 透传", () => {
  it("buildExecuteTurnRequest 把 options.traceId 放进请求体，且通过服务端 schema 校验", () => {
    const body = buildExecuteTurnRequest(mockInput(), "写一条口播", "写一条口播", [], {
      traceId: "trace-test-123",
    })
    expect(body).toMatchObject({ traceId: "trace-test-123" })
    const parsed = aimExecuteBodySchema.parse(body)
    expect(parsed.traceId).toBe("trace-test-123")
  })

  it("不传 traceId 时 schema 依然通过", () => {
    const body = buildExecuteTurnRequest(mockInput(), "写一条口播", "写一条口播", [], {})
    const parsed = aimExecuteBodySchema.parse(body)
    expect(parsed.traceId).toBeUndefined()
  })

  it("strict schema 仍拒绝未知字段", () => {
    const body = buildExecuteTurnRequest(mockInput(), "写一条口播", "写一条口播", [], {})
    expect(() => aimExecuteBodySchema.parse({ ...body, hacker: 1 })).toThrow()
  })
})

describe("executeGeneration 两处调用点 traceId 接线（buildAimEntryRequest seam）", () => {
  it("统一入口：useUnifiedEntry=true → execute 请求体透传 traceId 并通过服务端 schema", () => {
    const entry = buildAimEntryRequest(mockEntryInput(), "写一条口播", "写一条口播", [], {}, true, "trace-call-site-t1")
    expect(entry.kind).toBe("execute")
    if (entry.kind !== "execute") return
    expect(entry.body).toMatchObject({ traceId: "trace-call-site-t1" })
    const parsed = aimExecuteBodySchema.parse(entry.body)
    expect(parsed.traceId).toBe("trace-call-site-t1")
  })

  it("旧入口：useUnifiedEntry=false → generate 请求体透传 traceId 并通过服务端 schema", () => {
    const entry = buildAimEntryRequest(mockEntryInput(), "写一条口播", "写一条口播", [], {}, false, "trace-call-site-t2")
    expect(entry.kind).toBe("generate")
    if (entry.kind !== "generate") return
    expect(entry.body).toMatchObject({ traceId: "trace-call-site-t2" })
    const parsed = aimGenerateBodySchema.parse(entry.body)
    expect(parsed.traceId).toBe("trace-call-site-t2")
  })

  it("旧入口：剥离 executionAgentId，agentId 回落到委托执行体（与调用点一致）", () => {
    const entry = buildAimEntryRequest(
      mockEntryInput(),
      "写一条口播",
      "写一条口播",
      [],
      { executionAgentId: "video_script_engine" },
      false,
      "trace-call-site-t3",
    )
    expect(entry.kind).toBe("generate")
    if (entry.kind !== "generate") return
    // 剥离后不应携带 executionAgentId（generate schema 为 strict，否则会 400）
    expect(entry.body).not.toHaveProperty("executionAgentId")
    expect(entry.body.agentId).toBe("video_script_engine")
    expect(() => aimGenerateBodySchema.parse(entry.body)).not.toThrow()
  })
})
