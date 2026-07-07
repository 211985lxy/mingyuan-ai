import { describe, expect, it, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => ({
  aimGenerationCount: vi.fn(),
  aimExecutionTraceCount: vi.fn(),
  videoCopyExtractionCount: vi.fn(),
  competitorAnalysisCount: vi.fn(),
  videoTaskCount: vi.fn(),
  watchAccountCount: vi.fn(),
  clientProjectCount: vi.fn(),
  avatarCount: vi.fn(),
  knowledgeEntryCount: vi.fn(),
  userFindUnique: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: { count: mocks.aimGenerationCount },
    aimExecutionTrace: { count: mocks.aimExecutionTraceCount },
    videoCopyExtraction: { count: mocks.videoCopyExtractionCount },
    competitorAnalysis: { count: mocks.competitorAnalysisCount },
    videoTask: { count: mocks.videoTaskCount },
    watchAccount: { count: mocks.watchAccountCount },
    clientProject: { count: mocks.clientProjectCount },
    avatar: { count: mocks.avatarCount },
    knowledgeEntry: { count: mocks.knowledgeEntryCount },
    user: { findUnique: mocks.userFindUnique },
  },
}))

import {
  enforceCountBetaLimit,
  enforceDailyBetaLimit,
  enforceKnowledgeBetaLimit,
  enforceUploadSizeLimit,
  INTERNAL_BETA_LIMITS,
} from "@/lib/internal-beta-limits"

describe("internal beta limits", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userFindUnique.mockResolvedValue({ email: "limited@example.com" })
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("blocks AIM generation after the daily beta quota", async () => {
    mocks.aimGenerationCount.mockResolvedValue(INTERNAL_BETA_LIMITS.aimGenerateDaily)

    const res = await enforceDailyBetaLimit("u1", "aim_generate")

    expect(res?.status).toBe(429)
    expect(await res?.json()).toMatchObject({
      code: "INTERNAL_BETA_LIMIT_REACHED",
      limit: INTERNAL_BETA_LIMITS.aimGenerateDaily,
      used: INTERNAL_BETA_LIMITS.aimGenerateDaily,
    })
  })

  it("skips beta limits for the unlimited account", async () => {
    mocks.userFindUnique.mockResolvedValue({ email: "1450069849@qq.com" })

    await expect(enforceDailyBetaLimit("u1", "aim_generate")).resolves.toBeNull()
    await expect(enforceCountBetaLimit({ userId: "u1", kind: "client_project" })).resolves.toBeNull()
    await expect(enforceKnowledgeBetaLimit({ userId: "u1", projectId: "p1", incoming: 999 })).resolves.toBeNull()

    expect(mocks.aimGenerationCount).not.toHaveBeenCalled()
    expect(mocks.clientProjectCount).not.toHaveBeenCalled()
    expect(mocks.knowledgeEntryCount).not.toHaveBeenCalled()
  })

  it("allows project creation below the beta cap", async () => {
    mocks.clientProjectCount.mockResolvedValue(INTERNAL_BETA_LIMITS.clientProjects - 1)

    await expect(enforceCountBetaLimit({ userId: "u1", kind: "client_project" })).resolves.toBeNull()
  })

  it("blocks competitor analysis after the daily beta quota", async () => {
    mocks.competitorAnalysisCount.mockResolvedValue(INTERNAL_BETA_LIMITS.competitorAnalysisDaily)

    const res = await enforceDailyBetaLimit("u1", "competitor_analysis")

    expect(res?.status).toBe(429)
  })

  it("fails open when daily beta counting errors", async () => {
    mocks.videoCopyExtractionCount.mockRejectedValue(new Error("table missing"))

    await expect(enforceDailyBetaLimit("u1", "video_copy_extraction")).resolves.toBeNull()
    expect(console.error).toHaveBeenCalled()
  })

  it("blocks knowledge imports that would exceed the per-project cap", async () => {
    mocks.knowledgeEntryCount.mockResolvedValue(99)

    const res = await enforceKnowledgeBetaLimit({ userId: "u1", projectId: "p1", incoming: 2 })

    expect(res?.status).toBe(429)
  })

  it("blocks oversized uploads", async () => {
    const file = new File(["x".repeat(1024)], "large.txt")
    Object.defineProperty(file, "size", { value: INTERNAL_BETA_LIMITS.uploadBytes + 1 })

    expect(enforceUploadSizeLimit([file])?.status).toBe(413)
  })
})
