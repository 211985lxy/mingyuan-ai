import { describe, expect, it } from "vitest"

import {
  MOVE_PROJECT_TABLES,
  RETAIN_PROJECT_TABLES,
} from "@/features/projects/services/project-merge-policy"
import {
  applyProjectMerge,
  previewProjectMerge,
  remapAllowedProjects,
  type ProjectMergeInput,
  type ProjectMergeSnapshot,
  type ProjectMergeStore,
  type ProjectMergeTransaction,
  type ProjectMergeParticipant,
} from "@/features/projects/services/project-merge-service"

// ----- test helpers -------------------------------------------------------

interface ProjectInfo {
  projectId: string
  ownerId: string
  members: string[]
  boundAccounts: string[]
  status?: "active" | "archived" | "inactive"
}

function project(
  projectId: string,
  ownerId: string,
  members: string[],
  boundAccounts: string[],
  status: "active" | "archived" | "inactive" = "active",
): ProjectInfo {
  return { projectId, ownerId, members, boundAccounts, status }
}

type WriteOp = { method: string; table?: string }

interface StoreOpts {
  source?: ProjectInfo
  target?: ProjectInfo
  deployedTables?: readonly string[]
  activeWork?: { invocations: number; traces: number }
  bindings?: Record<string, string>
  admin?: { userId: string; status: "active" | "inactive" }
  failAt?: "writeAudit"
  rebindCount?: number
  archiveCount?: number
  /** Override the count the store reports from remapApiKeys. */
  remapCount?: number
}

function defaultSource(): ProjectInfo {
  return project("source", "source-owner", ["source-member"], ["source-bound"])
}

function defaultTarget(): ProjectInfo {
  return project("target", "target-owner", ["target-member"], ["target-bound"])
}

function buildSnapshot(opts: StoreOpts): ProjectMergeSnapshot {
  const source = opts.source ?? defaultSource()
  const target = opts.target ?? defaultTarget()
  const bindings = opts.bindings ?? {}

  const participantList: ProjectMergeParticipant[] = []
  const addParticipant = (userId: string, fallbackProjectId: string) => {
    participantList.push({
      userId,
      boundProjectId: bindings[userId] ?? fallbackProjectId,
    })
  }
  addParticipant(source.ownerId, source.projectId)
  for (const m of source.members) addParticipant(m, source.projectId)
  for (const a of source.boundAccounts) addParticipant(a, source.projectId)
  addParticipant(target.ownerId, target.projectId)
  for (const m of target.members) addParticipant(m, target.projectId)
  for (const a of target.boundAccounts) addParticipant(a, target.projectId)

  return {
    source: { ...source, status: source.status ?? "active" },
    target: { ...target, status: target.status ?? "active" },
    deployedTables: opts.deployedTables ?? [
      ...MOVE_PROJECT_TABLES,
      ...RETAIN_PROJECT_TABLES,
    ],
    activeWork: opts.activeWork ?? { invocations: 0, traces: 0 },
    participants: participantList,
    // Admin is a separate active administrator, NOT required to own either project.
    admin: opts.admin ?? { userId: "admin-1", status: "active" },
  }
}

interface TestStore extends ProjectMergeStore {
  calls: string[]
  committedWrites: WriteOp[]
  /** Last userIds passed to remapApiKeys (for asserting sorted participants). */
  lastRemapUserIds: string[] | null
}

function makeStore(opts: StoreOpts = {}): TestStore {
  const calls: string[] = []
  const committedWrites: WriteOp[] = []
  let lastRemapUserIds: string[] | null = null
  const snapshot = buildSnapshot(opts)

  const expectedRebind = snapshot.participants.filter(
    (p) => p.boundProjectId === snapshot.source.projectId,
  ).length
  const expectedArchive = 1

  const tx: ProjectMergeTransaction = {
    lockAndInspect: async (_input) => {
      calls.push("lockAndInspect")
      return snapshot
    },
    upsertTargetMembers: async () => {
      calls.push("upsertTargetMembers")
    },
    rebindParticipants: async () => {
      calls.push("rebindParticipants")
      return opts.rebindCount ?? expectedRebind
    },
    remapApiKeys: async (_source, _target, userIds) => {
      calls.push("remapApiKeys")
      lastRemapUserIds = userIds
      // Store reports its own count; service records it without predicting.
      return opts.remapCount ?? userIds.length
    },
    moveRows: async (table) => {
      calls.push("moveRows")
      return 0
    },
    archiveSource: async () => {
      calls.push("archiveSource")
      return opts.archiveCount ?? expectedArchive
    },
    writeSuccessAudit: async () => {
      calls.push("writeSuccessAudit")
      if (opts.failAt === "writeAudit") {
        throw new Error("audit write failed")
      }
      return "audit-id"
    },
  }

  let draftWrites: WriteOp[] = []

  const store: TestStore = {
    calls,
    committedWrites,
    get lastRemapUserIds() {
      return lastRemapUserIds
    },
    inspect: async () => {
      calls.push("inspect")
      return snapshot
    },
    transaction: async (run) => {
      draftWrites = []
      const wrappedTx: ProjectMergeTransaction = {
        lockAndInspect: tx.lockAndInspect,
        upsertTargetMembers: async (...args) => {
          draftWrites.push({ method: "upsertTargetMembers" })
          return tx.upsertTargetMembers(...args)
        },
        rebindParticipants: async (...args) => {
          draftWrites.push({ method: "rebindParticipants" })
          return tx.rebindParticipants(...args)
        },
        remapApiKeys: async (...args) => {
          draftWrites.push({ method: "remapApiKeys" })
          return tx.remapApiKeys(...args)
        },
        moveRows: async (...args) => {
          const table = args[0] as string
          draftWrites.push({ method: "moveRows", table })
          return tx.moveRows(...args)
        },
        archiveSource: async (...args) => {
          draftWrites.push({ method: "archiveSource" })
          return tx.archiveSource(...args)
        },
        writeSuccessAudit: async (...args) => {
          const id = await tx.writeSuccessAudit(...args)
          draftWrites.push({ method: "writeSuccessAudit" })
          return id
        },
      }
      const result = await run(wrappedTx)
      for (const w of draftWrites) committedWrites.push(w)
      return result
    },
    writeFailedAudit: async () => {
      calls.push("writeFailedAudit")
    },
  }

  return store
}

// Admin is a distinct active administrator; expected owners match the projects.
const validInput: ProjectMergeInput = {
  sourceProjectId: "source",
  targetProjectId: "target",
  adminUserId: "admin-1",
  expectedSourceOwnerId: "source-owner",
  expectedTargetOwnerId: "target-owner",
  requestId: "req-1",
  confirmation: "source->target",
  reason: "consolidating duplicate workspace",
}

// ----- tests --------------------------------------------------------------

describe("project merge service", () => {
  it("includes both projects' owners, members, and bound accounts exactly once", async () => {
    const store = makeStore({
      source: project("source", "source-owner", ["source-member"], ["source-bound"]),
      target: project("target", "target-owner", ["target-member"], ["target-bound"]),
    })
    const result = await applyProjectMerge(validInput, store)
    expect(result.participantIds).toEqual([
      "source-bound",
      "source-member",
      "source-owner",
      "target-bound",
      "target-member",
      "target-owner",
    ])
  })

  it("succeeds when admin is active but not an owner of either project", async () => {
    const store = makeStore()
    const result = await applyProjectMerge(validInput, store)
    expect(result.auditId).toBe("audit-id")
    expect(store.committedWrites.length).toBeGreaterThan(0)
  })

  it("rolls back before mutation when a participant is bound to a third project", async () => {
    const store = makeStore({ bindings: { "target-member": "third-project" } })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("third project")
    expect(store.committedWrites).toEqual([])
  })

  it("rejects unknown deployed project tables", async () => {
    const store = makeStore({ deployedTables: ["AimGeneration", "UnreviewedTable"] })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("UnreviewedTable")
  })

  it("blocks active source work", async () => {
    const store = makeStore({ activeWork: { invocations: 1, traces: 0 } })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("active work")
  })

  it("remaps API key grants without broadening unrelated access", () => {
    expect(remapAllowedProjects(["source", "other", "target"], "source", "target")).toEqual([
      "target",
      "other",
    ])
    expect(remapAllowedProjects([], "source", "target")).toEqual([])
  })

  it("writes audit last and rolls back if audit creation fails", async () => {
    const store = makeStore({ failAt: "writeAudit" })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("audit")
    expect(store.committedWrites).toEqual([])
  })

  it("rejects wrong direction confirmation", async () => {
    const store = makeStore()
    await expect(
      applyProjectMerge({ ...validInput, confirmation: "target->source" }, store),
    ).rejects.toThrow("confirmation")
  })

  it("rejects empty reason before opening the transaction", async () => {
    const store = makeStore()
    await expect(
      applyProjectMerge({ ...validInput, reason: "  " }, store),
    ).rejects.toThrow("reason")
    expect(store.calls).not.toContain("lockAndInspect")
  })

  it("rejects when source and target are the same project", async () => {
    const store = makeStore()
    await expect(
      applyProjectMerge(
        { ...validInput, sourceProjectId: "same", targetProjectId: "same", confirmation: "same->same" },
        store,
      ),
    ).rejects.toThrow("must differ")
  })

  it("rejects source owner mismatch", async () => {
    const store = makeStore()
    await expect(
      applyProjectMerge({ ...validInput, expectedSourceOwnerId: "someone-else" }, store),
    ).rejects.toThrow("owner mismatch")
  })

  it("rejects target owner mismatch", async () => {
    const store = makeStore()
    await expect(
      applyProjectMerge({ ...validInput, expectedTargetOwnerId: "someone-else" }, store),
    ).rejects.toThrow("owner mismatch")
  })

  it("rejects inactive target", async () => {
    const store = makeStore({
      target: project("target", "target-owner", ["target-member"], ["target-bound"], "inactive"),
    })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("target")
  })

  it("rejects archived source", async () => {
    const store = makeStore({
      source: project("source", "source-owner", ["source-member"], ["source-bound"], "archived"),
    })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("archived")
  })

  it("rejects inactive admin independent of project owners", async () => {
    const store = makeStore({ admin: { userId: "admin-1", status: "inactive" } })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("admin")
    await expect(applyProjectMerge(validInput, store)).rejects.not.toThrow(/mismatch/)
  })

  it("rejects when snapshot admin is active but not the invoking admin", async () => {
    const store = makeStore({
      admin: { userId: "other-active-admin", status: "active" },
    })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("admin mismatch")
    expect(store.committedWrites).toEqual([])
  })

  it("succeeds when snapshot admin userId matches invoking adminUserId", async () => {
    const store = makeStore({ admin: { userId: "admin-1", status: "active" } })
    const result = await applyProjectMerge(validInput, store)
    expect(result.auditId).toBe("audit-id")
  })

  it("rejects exact rebind-count mismatch", async () => {
    const store = makeStore({ rebindCount: 99 })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("rebind")
    expect(store.committedWrites).toEqual([])
  })

  it("rejects archive-count mismatch", async () => {
    const store = makeStore({ archiveCount: 0 })
    await expect(applyProjectMerge(validInput, store)).rejects.toThrow("archive")
    expect(store.committedWrites).toEqual([])
  })

  it("remaps API keys for all sorted participants and records store-reported count", async () => {
    const store = makeStore({ remapCount: 7 })
    const result = await applyProjectMerge(validInput, store)
    // remapApiKeys receives the sorted participant union, not just source.boundAccounts.
    expect(store.lastRemapUserIds).toEqual([
      "source-bound",
      "source-member",
      "source-owner",
      "target-bound",
      "target-member",
      "target-owner",
    ])
    // Service records whatever the store reports, without predicting it.
    expect(result.remapCount).toBe(7)
  })

  it("writes success audit last in order", async () => {
    const store = makeStore()
    await applyProjectMerge(validInput, store)
    const writeOrder = store.committedWrites.map((w) => w.method)
    expect(writeOrder[writeOrder.length - 1]).toBe("writeSuccessAudit")
    expect(store.calls).toContain("writeSuccessAudit")
    expect(store.calls).not.toContain("writeFailedAudit")
  })

  it("moves every move table sequentially", async () => {
    const store = makeStore()
    await applyProjectMerge(validInput, store)
    const moves = store.committedWrites.filter((w) => w.method === "moveRows")
    expect(moves.length).toBe(MOVE_PROJECT_TABLES.length)
    // tables appear in MOVE_PROJECT_TABLES order
    expect(moves.map((w) => w.table)).toEqual([...MOVE_PROJECT_TABLES])
  })

  it("preview does not call write methods on the store", async () => {
    const store = makeStore()
    await previewProjectMerge(validInput, store)
    const writeMethods = new Set([
      "upsertTargetMembers",
      "rebindParticipants",
      "remapApiKeys",
      "moveRows",
      "archiveSource",
      "writeSuccessAudit",
      "writeFailedAudit",
    ])
    for (const call of store.calls) {
      expect(writeMethods).not.toContain(call)
    }
    expect(store.committedWrites).toEqual([])
  })

  it("preview returns snapshot from inspect", async () => {
    const store = makeStore()
    const preview = await previewProjectMerge(validInput, store)
    expect(preview.source.projectId).toBe("source")
    expect(preview.target.projectId).toBe("target")
  })
})
