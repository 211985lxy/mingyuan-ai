import { beforeEach, describe, expect, it, vi } from "vitest"

const findFirst = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientProject: { findFirst },
  },
}))

import { assertAgentProjectAccess, type AgentApiContext } from "@/lib/agent-api-auth"

const context: AgentApiContext = {
  apiKeyId: "key-1",
  userId: "user-1",
  allowedProjects: ["project-1"],
  allowedAgents: ["content_producer"],
  clientType: null,
  allowedScopes: [],
  expiresAt: null,
  maxInputChars: 20_000,
  minuteLimit: 60,
  dailyTokenLimit: null,
}

describe("agent API project scope", () => {
  beforeEach(() => findFirst.mockReset())

  it("revalidates a scoped project against its current owner", async () => {
    findFirst.mockResolvedValueOnce({ id: "project-1" })

    await expect(assertAgentProjectAccess(context, "project-1")).resolves.toBeUndefined()
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "user-1", status: "active" },
      select: { id: true },
    })
  })

  it("rejects a stale project scope that no longer belongs to the key owner", async () => {
    findFirst.mockResolvedValueOnce(null)

    await expect(assertAgentProjectAccess(context, "project-1")).rejects.toThrow(
      "AGENT_PROJECT_FORBIDDEN",
    )
  })

  it("rejects an id that is not in the key scope without querying it", async () => {
    await expect(assertAgentProjectAccess(context, "project-2")).rejects.toThrow(
      "AGENT_PROJECT_FORBIDDEN",
    )
    expect(findFirst).not.toHaveBeenCalled()
  })
})
