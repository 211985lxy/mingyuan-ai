import { describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  findKey: vi.fn(),
  findUser: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentApiKey: { findUnique: mocks.findKey },
    user: { findUnique: mocks.findUser },
  },
}))

import { verifyMcpToken } from "@/lib/aim-remote/mcp-auth"

describe("MCP bearer auth", () => {
  it("only accepts an active maim_ key", async () => {
    const request = new Request("https://mingyuan-ai.cn/api/aim-mcp/mcp")
    expect(await verifyMcpToken(request, "not-a-key")).toBeUndefined()

    mocks.findKey.mockResolvedValue(null)
    expect(await verifyMcpToken(request, "maim_unit_test_key")).toBeUndefined()

    mocks.findKey.mockResolvedValue({
      id: "key-1",
      userId: "user-1",
      status: "active",
      expiresAt: null,
      allowedScopes: ["drafts.submit"],
    })
    mocks.findUser.mockResolvedValue({ boundProjectId: "proj-1" })
    const info = await verifyMcpToken(request, "maim_unit_test_key")
    expect(info?.apiKeyId).toBe("key-1")
    expect(info?.scopes).toEqual(["drafts.submit"])
    expect(info?.token.startsWith("maim_")).toBe(true)
  })
})