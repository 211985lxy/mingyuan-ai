import { readFileSync } from "node:fs"
import { join } from "node:path"

import { beforeEach, describe, expect, it, vi } from "vitest"

const request = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api/core", () => ({
  ApiError: class ApiError extends Error {},
  getApiErrorMessage: vi.fn(),
  request,
}))

describe("style profile project scope", () => {
  beforeEach(() => request.mockReset())

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

  it("项目内润色和生成读取项目风格档案，而不是用户全局", () => {
    const polishSource = readFileSync(join(process.cwd(), "src/app/api/scripts/polish/route.ts"), "utf8")
    const generateSource = readFileSync(join(process.cwd(), "src/app/api/scripts/generate/route.ts"), "utf8")

    expect(polishSource).toContain("getStyleProfileBlock(user.id, projectId ?? null)")
    expect(polishSource).toContain("projectId: projectId ?? null")
    expect(generateSource).toContain("getStyleProfileBlock(user.id, projectId ?? null)")
  })
})
