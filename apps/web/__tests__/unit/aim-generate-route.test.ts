import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateRequest,
  authErrorResponse,
  enforceDailyBetaLimit,
  generateAimContent,
  runQualityCheck,
  buildRawInputWithMarketViralContext,
  buildRawInputWithVideoCopyContext,
  buildRawInputWithTrendingContext,
  buildRawInputWithCommentInsightContext,
  ownsActiveProject,
} = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ id: "user-1" })),
  authErrorResponse: vi.fn(() => null),
  enforceDailyBetaLimit: vi.fn(async () => null),
  generateAimContent: vi.fn(),
  runQualityCheck: vi.fn(async () => ({
    editorial: { score: 8, passed: true, feedback: "" },
    aiTaste: { score: 8, passed: true, feedback: "" },
    attraction: { score: 8, passed: true, feedback: "" },
    logic: { score: 8, passed: true, feedback: "" },
    overall: { score: 8, passed: true, needsRewrite: false },
    rewriteCount: 0,
  })),
  buildRawInputWithMarketViralContext: vi.fn(async (_userId, rawInput) => rawInput),
  buildRawInputWithVideoCopyContext: vi.fn(async (_userId, rawInput) => rawInput),
  buildRawInputWithTrendingContext: vi.fn(async (rawInput) => rawInput),
  buildRawInputWithCommentInsightContext: vi.fn(async (_userId, rawInput) => rawInput),
  ownsActiveProject: vi.fn(async () => true),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest,
  authErrorResponse,
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceDailyBetaLimit,
}))

vi.mock("@/lib/resource-ownership", () => ({
  ownsActiveProject,
}))

vi.mock("@/lib/aim-generator", () => ({
  generateAimContent,
}))

vi.mock("@/lib/quality-gate", () => ({
  runQualityCheck,
}))

vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => undefined),
  addAimTraceStep: vi.fn(async () => undefined),
  failAimTrace: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace, _key, _label, fn) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
}))

vi.mock("@/lib/aim-generate-context", () => ({
  buildRawInputWithMarketViralContext,
  buildRawInputWithVideoCopyContext,
  buildRawInputWithTrendingContext,
  buildRawInputWithCommentInsightContext,
}))

// Route 契约测试只验证入口对接与响应序列化；运行时内核、
// 快照和边界由独立单测覆盖，这里不连真实 DB。
vi.mock("@/lib/aim-harness/runtime", () => ({
  executeAimRun: vi.fn(async (request: { runLlmQuality?: boolean }, execute: (spec: { agentId: string; runtimeTask: string }) => Promise<{ output: { id: string; results: Array<{ format: string; content: string; wordCount: number }>; knowledgeUsed: unknown[] } }>) => {
    const adapted = await execute({ agentId: "content_producer", runtimeTask: "new_copy" })
    const result = adapted.output
    let qualityReport: Record<string, unknown> | undefined
    if (request.runLlmQuality !== false) {
      const { runQualityCheck } = await import("@/lib/quality-gate")
      const main = result.results.find((item) =>
        ["video_script", "koubo_script", "xiaohongshu_post"].includes(item.format) && item.content?.trim()
      )
      if (main) {
        const report = await runQualityCheck({ content: main.content, topicTitle: undefined })
        qualityReport = {
          overallScore: report.overall.score,
          passed: report.overall.passed,
          editorial: report.editorial.score,
          aiTaste: report.aiTaste.score,
          attraction: report.attraction.score,
          logic: report.logic.score,
        }
      }
    }
    return {
      output: result,
      metadata: {
        runId: "run_test",
        degraded: false,
        provider: "test-provider",
        model: "test-model",
      },
      qualityChecks: [],
      qualityStatus: "pass",
      qualityReport,
    }
  }),
}))

import { POST } from "@/app/api/aim/generate/route"

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/aim/generate", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  })
}

describe("POST /api/aim/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateRequest.mockResolvedValue({ id: "user-1" })
    authErrorResponse.mockReturnValue(null)
    enforceDailyBetaLimit.mockResolvedValue(null)
    ownsActiveProject.mockResolvedValue(true)
  })

  it("rejects a project that is not owned before generation starts", async () => {
    ownsActiveProject.mockResolvedValueOnce(false)

    const res = await POST(makeRequest({
      agentId: "content_producer",
      rawInput: "写一条文案",
      targetFormats: ["video_script"],
      projectId: "project-from-another-user",
    }))

    expect(res.status).toBe(404)
    expect(ownsActiveProject).toHaveBeenCalledWith("user-1", "project-from-another-user")
    expect(generateAimContent).not.toHaveBeenCalled()
  })

  it("skips quality gate for business diagnosis raw_copy output", async () => {
    generateAimContent.mockResolvedValue({
      id: "gen-1",
      results: [{ format: "raw_copy", content: "定位方案正文", wordCount: 6 }],
      knowledgeUsed: [],
    })

    const res = await POST(makeRequest({
      agentId: "business_diagnosis",
      rawInput: "帮我做账号定位",
      targetFormats: ["raw_copy"],
      projectId: "project-1",
      taskType: "write_script",
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(runQualityCheck).not.toHaveBeenCalled()
    expect(body).toEqual(expect.objectContaining({
      id: "gen-1",
      results: [expect.objectContaining({ format: "raw_copy" })],
    }))
    expect(body.qualityReport).toBeUndefined()
  })

  it("keeps quality gate for publishable script output", async () => {
    generateAimContent.mockResolvedValue({
      id: "gen-2",
      results: [{ format: "video_script", content: "这是一个可发布的短视频口播脚本", wordCount: 16 }],
      knowledgeUsed: [],
    })

    const res = await POST(makeRequest({
      agentId: "content_producer",
      rawInput: "写一条短视频口播",
      targetFormats: ["video_script"],
      projectId: "project-1",
      taskType: "write_script",
    }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(runQualityCheck).toHaveBeenCalledWith({
      content: "这是一个可发布的短视频口播脚本",
      topicTitle: undefined,
    })
    expect(body.qualityReport).toEqual(expect.objectContaining({
      overallScore: 8,
      passed: true,
    }))
  })

  it("bypasses auxiliary market context for meeting-minutes asset-pack requests", async () => {
    generateAimContent.mockResolvedValue({
      id: "gen-3",
      results: [{ format: "raw_copy", content: "会议纪要内容资产包", wordCount: 10 }],
      knowledgeUsed: [],
    })

    const res = await POST(makeRequest({
      agentId: "business_diagnosis",
      rawInput: "请基于当前会议纪要，生成一份高密度《会议纪要内容资产包》。固定输出：1. 会议一句话结论；2. 关键信息抽取表。",
      targetFormats: ["raw_copy"],
      projectId: "project-1",
      taskType: "write_script",
      useMarketViralVideos: true,
      videoCopyExtractionId: "video-1",
    }))

    expect(res.status).toBe(200)
    expect(buildRawInputWithVideoCopyContext).not.toHaveBeenCalled()
    expect(buildRawInputWithMarketViralContext).toHaveBeenCalledWith("user-1", expect.any(String), false)
    expect(buildRawInputWithTrendingContext).toHaveBeenCalledWith(expect.any(String), false)
    expect(buildRawInputWithCommentInsightContext).toHaveBeenCalledWith("user-1", expect.any(String), false)
  })
})
