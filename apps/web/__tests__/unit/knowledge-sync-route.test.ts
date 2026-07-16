import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  projectFindFirst: vi.fn(),
  knowledgeFindUnique: vi.fn(),
  upsert: vi.fn(),
  ensureEmbedding: vi.fn().mockResolvedValue(undefined),
}))

const mockEnv = vi.hoisted(() => ({
  OBSIDIAN_SYNC_TOKEN: "sync-secret" as string | undefined,
  OBSIDIAN_SYNC_USER_ID: "configured-user" as string | undefined,
}))

vi.mock("@/env", () => ({ env: mockEnv }))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    clientProject: { findFirst: mocks.projectFindFirst },
    knowledgeEntry: {
      findUnique: mocks.knowledgeFindUnique,
      upsert: mocks.upsert,
    },
  },
}))
vi.mock("@/lib/llm/embeddings", () => ({ ensureKnowledgeEmbedding: mocks.ensureEmbedding }))

import { POST } from "@/app/api/knowledge/sync/route"

function request(token: string, body: unknown) {
  return new NextRequest("http://localhost/api/knowledge/sync", {
    method: "POST",
    headers: { "x-obsidian-token": token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("knowledge sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv.OBSIDIAN_SYNC_TOKEN = "sync-secret"
    mockEnv.OBSIDIAN_SYNC_USER_ID = "configured-user"
    mocks.userFindUnique.mockResolvedValue({ id: "configured-user" })
    mocks.knowledgeFindUnique.mockResolvedValue(null)
  })

  it("fails closed when the sync token is not configured", async () => {
    mockEnv.OBSIDIAN_SYNC_TOKEN = undefined
    const response = await POST(request("", { entries: [] }))
    expect(response.status).toBe(503)
  })

  it("rejects an invalid sync token before reading the database", async () => {
    const response = await POST(request("wrong", { entries: [] }))
    expect(response.status).toBe(401)
    expect(mocks.userFindUnique).not.toHaveBeenCalled()
  })

  it("upserts valid entries into the authorized project and queues embeddings", async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: "project-1" })
    mocks.upsert.mockResolvedValue({ id: "obsidian-1", title: "客户案例" })

    const response = await POST(request("sync-secret", {
      projectId: "project-1",
      entries: [{ id: "obsidian-1", title: "客户案例", content: "真实内容", category: "project_case", tags: ["case"] }],
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, syncedCount: 1 })
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "project-1", userId: "configured-user" } }))
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ userId: "configured-user", projectId: "project-1" }) }))
    expect(mocks.ensureEmbedding).toHaveBeenCalledWith("obsidian-1")
  })
})
