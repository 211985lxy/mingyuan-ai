import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  projectFindFirst: vi.fn(),
  knowledgeFindUnique: vi.fn(),
  knowledgeUpsert: vi.fn(),
  ensureKnowledgeEmbedding: vi.fn(),
}))

vi.mock("@/env", () => ({
  env: {
    OBSIDIAN_SYNC_TOKEN: "sync-secret",
    OBSIDIAN_SYNC_USER_ID: "configured-user",
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    clientProject: { findFirst: mocks.projectFindFirst },
    knowledgeEntry: {
      findUnique: mocks.knowledgeFindUnique,
      upsert: mocks.knowledgeUpsert,
    },
  },
}))

vi.mock("@/lib/llm/embeddings", () => ({
  ensureKnowledgeEmbedding: mocks.ensureKnowledgeEmbedding,
}))

import { POST } from "@/app/api/knowledge/sync/route"

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/knowledge/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-obsidian-token": "sync-secret",
    },
    body: JSON.stringify(body),
  })
}

const entry = {
  id: "obsidian-entry-1",
  title: "客户问题",
  content: "客户真实问题内容",
  category: "customer_pain",
  tags: ["访谈"],
}

describe("Obsidian knowledge sync ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.userFindUnique.mockResolvedValue({ id: "configured-user" })
    mocks.projectFindFirst.mockResolvedValue({ id: "project-1" })
    mocks.knowledgeFindUnique.mockResolvedValue(null)
    mocks.knowledgeUpsert.mockResolvedValue({ id: entry.id, title: entry.title })
    mocks.ensureKnowledgeEmbedding.mockResolvedValue(undefined)
  })

  it("binds writes to the configured user instead of a request body user id", async () => {
    const response = await POST(request({
      userId: "attacker-selected-user",
      projectId: "project-1",
      entries: [entry],
    }))

    expect(response.status).toBe(200)
    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: { id: "project-1", userId: "configured-user" },
      select: { id: true },
    })
    expect(mocks.knowledgeUpsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: entry.id, userId: "configured-user" },
      create: expect.objectContaining({ userId: "configured-user", projectId: "project-1" }),
    }))
  })

  it("rejects an external id already owned by another tenant", async () => {
    mocks.knowledgeFindUnique.mockResolvedValueOnce({ userId: "other-user" })

    const response = await POST(request({ entries: [entry] }))

    expect(response.status).toBe(409)
    expect(mocks.knowledgeUpsert).not.toHaveBeenCalled()
  })
})
