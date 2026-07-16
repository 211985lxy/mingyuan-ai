import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  userFindFirst: vi.fn(),
  userFindUnique: vi.fn(),
  projectFindFirst: vi.fn(),
  upsert: vi.fn(),
  ensureEmbedding: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst, findUnique: mocks.userFindUnique },
    clientProject: { findFirst: mocks.projectFindFirst },
    knowledgeEntry: { upsert: mocks.upsert },
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
  const originalToken = process.env.OBSIDIAN_SYNC_TOKEN

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.OBSIDIAN_SYNC_TOKEN = "sync-secret"
  })
  afterEach(() => {
    if (originalToken === undefined) delete process.env.OBSIDIAN_SYNC_TOKEN
    else process.env.OBSIDIAN_SYNC_TOKEN = originalToken
  })

  it("fails closed when the sync token is not configured", async () => {
    delete process.env.OBSIDIAN_SYNC_TOKEN
    const response = await POST(request("", { entries: [] }))
    expect(response.status).toBe(503)
  })

  it("rejects an invalid sync token before reading the database", async () => {
    const response = await POST(request("wrong", { entries: [] }))
    expect(response.status).toBe(401)
    expect(mocks.userFindFirst).not.toHaveBeenCalled()
  })

  it("upserts valid entries into the authorized project and queues embeddings", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "user-1" })
    mocks.projectFindFirst.mockResolvedValue({ id: "project-1" })
    mocks.upsert.mockResolvedValue({ id: "obsidian-1", title: "客户案例" })

    const response = await POST(request("sync-secret", {
      userId: "user-1",
      projectId: "project-1",
      entries: [{ id: "obsidian-1", title: "客户案例", content: "真实内容", category: "project_case", tags: ["case"] }],
    }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ success: true, syncedCount: 1 })
    expect(mocks.projectFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "project-1", userId: "user-1" } }))
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ userId: "user-1", projectId: "project-1" }) }))
    expect(mocks.ensureEmbedding).toHaveBeenCalledWith("obsidian-1")
  })
})
