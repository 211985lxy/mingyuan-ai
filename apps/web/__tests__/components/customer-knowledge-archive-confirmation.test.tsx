import { beforeEach, describe, expect, it, vi } from "vitest"

import { archiveCustomerKnowledgeEntry } from "@/features/knowledge/hooks/customer-knowledge-mutation-helpers"
import { archiveKnowledge, type KnowledgeEntry } from "@/lib/api/client"

vi.mock("@/lib/api/client", () => ({
  ApiError: class ApiError extends Error {
    status = 500
  },
  archiveKnowledge: vi.fn(),
  createKnowledge: vi.fn(),
  updateKnowledge: vi.fn(),
}))

const entry: KnowledgeEntry = {
  id: "kb-1",
  userId: "user-1",
  projectId: "project-1",
  category: "boss_experience",
  title: "领秀客户经验",
  content: "真实经验",
  tags: [],
  sourceType: "manual",
  sortOrder: 0,
  status: "active",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
}

describe("customer knowledge archive confirmation", () => {
  beforeEach(() => {
    vi.mocked(archiveKnowledge).mockReset()
  })

  it("cancels archive without changing data", async () => {
    const reload = vi.fn()
    vi.spyOn(window, "confirm").mockReturnValue(false)

    await archiveCustomerKnowledgeEntry({ entry, reload })

    expect(window.confirm).toHaveBeenCalledWith(
      "确认归档「领秀客户经验」？归档后默认列表不再显示，不是永久删除。",
    )
    expect(archiveKnowledge).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it("archives only after confirmation and reloads the list", async () => {
    const reload = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(window, "confirm").mockReturnValue(true)
    vi.mocked(archiveKnowledge).mockResolvedValue({ ...entry, status: "archived" })

    await archiveCustomerKnowledgeEntry({ entry, reload })

    expect(archiveKnowledge).toHaveBeenCalledWith("kb-1")
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
