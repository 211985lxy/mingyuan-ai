import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const authUser = vi.hoisted(() => ({ id: "allowed-user" as string }))

const mockEnv = vi.hoisted(() => ({
  OBSIDIAN_EXPORT_ENABLED: undefined as string | undefined,
  OBSIDIAN_SYNC_USER_ID: "allowed-user" as string | undefined,
}))

const loadConfig = vi.hoisted(() => vi.fn())

vi.mock("@/env", () => ({ env: mockEnv }))

vi.mock("@/lib/user-auth", () => ({
  withUserAuth:
    (
      handler: (
        request: NextRequest,
        context: { user: { id: string; email: string } },
      ) => Promise<Response>,
    ) =>
    (request: NextRequest) =>
      handler(request, { user: { id: authUser.id, email: "u@example.com" } }),
}))

vi.mock("@/lib/security-metrics", () => ({
  incrementSecurityMetric: vi.fn(),
}))

vi.mock("@/lib/obsidian-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/obsidian-export")>()
  return {
    ...actual,
    loadObsidianSyncConfig: loadConfig,
  }
})

import { POST } from "@/app/api/knowledge/export-obsidian/route"
import { GET as statusGET } from "@/app/api/knowledge/obsidian-status/route"
import {
  OBSIDIAN_LIMITS,
  assertPathInsideRoot,
  resetObsidianDailyQuotaForTests,
  resolveFixedExportRoot,
  sanitizeExportDir,
} from "@/lib/obsidian-export"

function segment() {
  return { params: Promise.resolve({}) }
}

function exportRequest(body: unknown) {
  return new NextRequest("http://localhost/api/knowledge/export-obsidian", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("obsidian path helpers", () => {
  it("rejects exportDir path escape", () => {
    expect(sanitizeExportDir("../outside")).toBeNull()
    expect(sanitizeExportDir("/abs")).toBeNull()
    expect(sanitizeExportDir("MingyuanGenerated")).toBe("MingyuanGenerated")
  })

  it("assertPathInsideRoot blocks traversal", () => {
    const root = "/tmp/vault/export"
    expect(assertPathInsideRoot(root, "/tmp/vault/export/a.md").ok).toBe(true)
    expect(assertPathInsideRoot(root, "/tmp/vault/export/../secret.md").ok).toBe(false)
    expect(assertPathInsideRoot(root, "/etc/passwd").ok).toBe(false)
  })
})

describe("POST /api/knowledge/export-obsidian", () => {
  let vaultRoot = ""

  beforeEach(async () => {
    resetObsidianDailyQuotaForTests()
    authUser.id = "allowed-user"
    mockEnv.OBSIDIAN_EXPORT_ENABLED = undefined
    mockEnv.OBSIDIAN_SYNC_USER_ID = "allowed-user"
    vaultRoot = await mkdtemp(path.join(tmpdir(), "obsidian-export-"))
    loadConfig.mockResolvedValue({
      obsidianVaultPath: vaultRoot,
      exportDir: "MingyuanGenerated",
    })
  })

  afterEach(async () => {
    resetObsidianDailyQuotaForTests()
    loadConfig.mockReset()
    if (vaultRoot) await rm(vaultRoot, { recursive: true, force: true })
  })

  it("is disabled by default", async () => {
    const res = await POST(exportRequest({ title: "t", content: "c" }), segment())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(vaultRoot)
  })

  it("rejects wrong user even when enabled", async () => {
    mockEnv.OBSIDIAN_EXPORT_ENABLED = "true"
    authUser.id = "other-user"
    const res = await POST(exportRequest({ title: "t", content: "c" }), segment())
    expect(res.status).toBe(403)
  })

  it("rejects content oversize", async () => {
    mockEnv.OBSIDIAN_EXPORT_ENABLED = "true"
    const content = "x".repeat(OBSIDIAN_LIMITS.CONTENT_MAX_BYTES + 1)
    const res = await POST(exportRequest({ title: "t", content }), segment())
    expect(res.status).toBe(413)
  })

  it("rejects daily quota overflow", async () => {
    mockEnv.OBSIDIAN_EXPORT_ENABLED = "true"
    for (let i = 0; i < OBSIDIAN_LIMITS.DAILY_MAX; i += 1) {
      const res = await POST(
        exportRequest({ title: `t-${i}`, content: `c-${i}` }),
        segment(),
      )
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.filePath).toBeUndefined()
      expect(JSON.stringify(body)).not.toContain(vaultRoot)
    }
    const limited = await POST(exportRequest({ title: "overflow", content: "c" }), segment())
    expect(limited.status).toBe(429)
  })

  it("rejects escaping exportDir from config", async () => {
    mockEnv.OBSIDIAN_EXPORT_ENABLED = "true"
    loadConfig.mockResolvedValue({
      obsidianVaultPath: vaultRoot,
      exportDir: "../escape-me",
    })
    const res = await POST(exportRequest({ title: "t", content: "c" }), segment())
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(vaultRoot)
    expect(body.error).not.toMatch(/\//)
  })

  it("resolveFixedExportRoot refuses path escape", async () => {
    const result = await resolveFixedExportRoot({
      obsidianVaultPath: vaultRoot,
      exportDir: "../../outside",
    })
    expect(result.ok).toBe(false)
  })
})

describe("GET /api/knowledge/obsidian-status", () => {
  beforeEach(() => {
    authUser.id = "allowed-user"
    mockEnv.OBSIDIAN_EXPORT_ENABLED = undefined
    mockEnv.OBSIDIAN_SYNC_USER_ID = "allowed-user"
    loadConfig.mockResolvedValue(null)
  })

  it("reports disabled without absolute paths", async () => {
    const res = await statusGET(
      new NextRequest("http://localhost/api/knowledge/obsidian-status"),
      segment(),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ enabled: false, isPhysicalMode: false })
    expect(body.obsidianVaultPath).toBeUndefined()
  })
})
