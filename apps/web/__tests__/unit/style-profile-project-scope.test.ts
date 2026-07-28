import { readFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

const request = vi.hoisted(() => vi.fn())
const findMany = vi.hoisted(() => vi.fn())
const count = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api/core", () => ({
  ApiError: class ApiError extends Error {},
  getApiErrorMessage: vi.fn(),
  request,
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    knowledgeEntry: {
      findMany,
      count,
    },
  },
}))

describe("style profile project scope", () => {
  beforeEach(() => {
    request.mockReset()
    findMany.mockReset()
    count.mockReset()
  })

  it("项目内风格沉淀会携带 projectId", async () => {
    request.mockResolvedValue({ delta: null, profile: null })
    const { evolveStyleConversation } = await import("@/lib/api/aim")

    await evolveStyleConversation({
      messages: [
        { role: "user", content: "保留我的口语" },
        { role: "assistant", content: "已按口语处理" },
      ],
      projectId: "project-1",
    })

    expect(request).toHaveBeenCalledWith("/api/aim/evolve-style", expect.objectContaining({
      body: JSON.stringify({
        messages: [
          { role: "user", content: "保留我的口语" },
          { role: "assistant", content: "已按口语处理" },
        ],
        projectId: "project-1",
      }),
    }))
  })

  it("preview/commit 客户端会带上 operation", async () => {
    request.mockResolvedValue({ delta: null, profile: null, preview: true })
    const { previewStyleProfile, commitStyleProfile } = await import("@/lib/api/aim")

    await previewStyleProfile({
      samples: [{ content: "样本文案", label: "core" }],
      projectId: "project-1",
    })
    expect(request).toHaveBeenCalledWith("/api/aim/evolve-style", expect.objectContaining({
      body: JSON.stringify({
        operation: "preview",
        samples: [{ content: "样本文案", label: "core" }],
        messages: undefined,
        projectId: "project-1",
      }),
    }))

    request.mockResolvedValue({ delta: null, profile: { id: "k1", title: "IP 写作风格主档案" } })
    await commitStyleProfile({
      projectId: "project-1",
      delta: {
        cognitivePattern: { entry: "反常识" },
        emotionalTexture: {},
        structuralDna: {},
        microLinguistics: {},
        coreValues: {},
        decisionHeuristics: {},
        antiPatterns: {},
        honestLimits: {},
        evidence: "证据",
        confidence: "user_claim",
      },
    })
    expect(request).toHaveBeenLastCalledWith("/api/aim/evolve-style", expect.objectContaining({
      body: expect.stringContaining('"operation":"commit"'),
    }))
  })

  it("项目内润色和生成读取风格档案块（含 projectId）", () => {
    const polishSource = readFileSync(join(process.cwd(), "src/lib/aim/services/script-polish.ts"), "utf8")
    const generateSource = readFileSync(join(process.cwd(), "src/app/api/scripts/generate/route.ts"), "utf8")

    expect(polishSource).toContain("getStyleProfileBlock(userId, input.projectId ?? null)")
    expect(generateSource).toContain("getStyleProfileBlock(user.id, projectId ?? null)")
  })

  it("项目无档案时回退全局；有项目档案时不读全局", async () => {
    const { getStyleProfileBlock } = await import("@/lib/style-profile")

    findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          title: "IP 写作风格主档案",
          content: "全局短句风格",
          updatedAt: new Date("2026-07-01"),
        },
      ])

    const fallback = await getStyleProfileBlock("user-1", "project-1")
    expect(fallback).toContain("项目无档案回退")
    expect(fallback).toContain("全局短句风格")
    expect(findMany).toHaveBeenCalledTimes(2)

    findMany.mockReset()
    findMany.mockResolvedValueOnce([
      {
        title: "IP 写作风格主档案",
        content: "项目专属风格",
        updatedAt: new Date("2026-07-02"),
      },
    ])
    const projectOnly = await getStyleProfileBlock("user-1", "project-1")
    expect(projectOnly).toContain("项目风格")
    expect(projectOnly).toContain("项目专属风格")
    expect(projectOnly).not.toContain("回退")
    expect(findMany).toHaveBeenCalledTimes(1)
  })

  it("快速出稿（无项目）只读全局档案", async () => {
    const { getStyleProfileBlock } = await import("@/lib/style-profile")
    findMany.mockResolvedValueOnce([
      {
        title: "IP 写作风格主档案",
        content: "仅全局",
        updatedAt: new Date("2026-07-01"),
      },
    ])
    const block = await getStyleProfileBlock("user-1", null)
    expect(block).toContain("IP 全局风格")
    expect(block).not.toContain("回退")
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: null }),
      }),
    )
  })
})
