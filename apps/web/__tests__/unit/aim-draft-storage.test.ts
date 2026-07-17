import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { aimDraftStorageKey, clearAimDraft, loadAimDraft, saveAimDraft } from "@/lib/aim/draft-storage"

describe("AIM draft storage", () => {
  const values = new Map<string, string>()

  beforeEach(() => {
    values.clear()
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it("loads a valid draft and clamps its editor width", () => {
    values.set(aimDraftStorageKey("content_producer", "project-1"), JSON.stringify({
      selectedAgentId: "content_producer",
      selectedProjectId: "project-1",
      input: "继续修改",
      messages: [],
      editorPanelWidth: 9999,
    }))

    const draft = loadAimDraft("content_producer", "project-1")
    expect(draft?.input).toBe("继续修改")
    expect(draft?.editorPanelWidth).toBeLessThan(9999)
  })

  it("ignores corrupt or invalid drafts", () => {
    values.set(aimDraftStorageKey("content_producer", "quick"), "{")
    expect(loadAimDraft("content_producer", "quick")).toBeNull()
    values.set(aimDraftStorageKey("content_producer", "quick"), JSON.stringify({ selectedAgentId: "unknown", messages: [] }))
    expect(loadAimDraft("content_producer", "quick")).toBeNull()
  })

  it("removes empty and explicitly cleared drafts", () => {
    saveAimDraft({ selectedAgentId: "content_producer", selectedProjectId: "", input: "", messages: [] }, "quick")
    expect(values.has(aimDraftStorageKey("content_producer", "quick"))).toBe(false)
    values.set(aimDraftStorageKey("content_producer", "project-1"), "saved")
    clearAimDraft("content_producer", "project-1")
    expect(values.has(aimDraftStorageKey("content_producer", "project-1"))).toBe(false)
  })

  it("isolates drafts by project scope", () => {
    saveAimDraft({ selectedAgentId: "content_producer", selectedProjectId: "project-1", input: "项目一", messages: [] }, "project-1")
    saveAimDraft({ selectedAgentId: "content_producer", selectedProjectId: "project-2", input: "项目二", messages: [] }, "project-2")

    expect(loadAimDraft("content_producer", "project-1")?.input).toBe("项目一")
    expect(loadAimDraft("content_producer", "project-2")?.input).toBe("项目二")
    expect(loadAimDraft("content_producer", "quick")).toBeNull()
  })
})
