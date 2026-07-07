import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock LLMClient ────────────────────────────────────────────────────────────

const mockComplete = vi.fn()

vi.mock("@/lib/llm/client", () => ({
  LLMClient: {
    shared: () => ({ complete: mockComplete }),
  },
}))

// Import AFTER mock is set up
const { POST } = await import(
  "@/app/api/competitor-analysis/methodology/compile/route"
)

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/competitor-analysis/methodology/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

const VALID_LLM_RESPONSE = JSON.stringify([
  {
    pageType: "viral_methodology",
    title: "竞品爆款方法论",
    content:
      "## 开头打法\n痛点提问\n## 中段推进\n案例推进\n## 结尾收束\n号召关注\n## 爆点迁移清单\n- 痛点迁移\n## 适用场景标签\n教育类",
    frontmatter: {},
    sources: [
      { kind: "aim_generation", id: "comp-123", label: "竞品分析" },
    ],
    links: [],
  },
])

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/competitor-analysis/methodology/compile", () => {
  beforeEach(() => {
    mockComplete.mockClear()
    mockComplete.mockResolvedValue({
      content: VALID_LLM_RESPONSE,
      model: "test-model",
      provider: "test-provider",
    })
  })

  it("returns proposedPages with 1 item and pageType === viral_methodology", async () => {
    const res = await POST(
      makeRequest({
        competitorAnalysisText:
          "该竞品通过痛点提问开头，中段用案例推进，结尾号召关注。",
        projectName: "测试项目",
        sourceCompetitorId: "comp-123",
      })
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.proposedPages).toHaveLength(1)
    expect(json.proposedPages[0].pageType).toBe("viral_methodology")
    expect(json.proposedPages[0].title).toBe("竞品爆款方法论")
  })

  it("returns 400 when competitorAnalysisText is missing", async () => {
    const res = await POST(
      makeRequest({ projectName: "测试项目" })
    )

    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toContain("competitorAnalysisText")
  })

  it("returns 400 when competitorAnalysisText is empty string", async () => {
    const res = await POST(
      makeRequest({ competitorAnalysisText: "   " })
    )

    expect(res.status).toBe(400)
  })
})
