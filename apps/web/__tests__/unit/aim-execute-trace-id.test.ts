import { describe, expect, it } from "vitest"

import { aimExecuteBodySchema } from "@/features/aim/contracts/api"
import { buildExecuteTurnRequest } from "@/hooks/aim-generation-delivery-flow"

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
