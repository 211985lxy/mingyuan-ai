import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const { findUnique, readSessionToken, isCsrfSafe } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readSessionToken: vi.fn(),
  isCsrfSafe: vi.fn(() => true),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    adminUser: { findUnique },
  },
}))

vi.mock("@/lib/auth-session", () => ({
  readSessionToken,
  isCsrfSafe,
}))

vi.mock("@/env", () => ({
  env: {
    ADMIN_JWT_SECRET: "x".repeat(32),
    CRON_SECRET: "cron-secret",
    NODE_ENV: "test",
  },
}))

import {
  signAdminToken,
  withAdminOnly,
  withAdminOrEditor,
} from "@/lib/admin-auth"

function listAdminRouteFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...listAdminRouteFiles(full))
    else if (name === "route.ts") out.push(full)
  }
  return out
}

function makeAdminRequest(token: string) {
  return new NextRequest("http://localhost/api/admin/example", {
    method: "GET",
    headers: { cookie: `admin_session=${token}` },
  })
}

describe("admin role entrypoints", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isCsrfSafe.mockReturnValue(true)
    findUnique.mockResolvedValue({
      id: "admin-1",
      isActive: true,
      sessionVersion: 1,
    })
  })

  it("withAdminOnly rejects editors with 403", async () => {
    const token = signAdminToken({
      id: "admin-1",
      email: "editor@example.com",
      role: "editor",
      sessionVersion: 1,
    })
    readSessionToken.mockReturnValue({ token, source: "cookie" })

    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const res = await withAdminOnly(handler)(makeAdminRequest(token), {
      params: Promise.resolve({}),
    })

    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  it("withAdminOnly allows admins", async () => {
    const token = signAdminToken({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      sessionVersion: 1,
    })
    readSessionToken.mockReturnValue({ token, source: "cookie" })

    const handler = vi.fn(async () => NextResponse.json({ ok: true }))
    const res = await withAdminOnly(handler)(makeAdminRequest(token), {
      params: Promise.resolve({}),
    })

    expect(res.status).toBe(200)
    expect(handler).toHaveBeenCalled()
  })

  it("withAdminOrEditor allows both admin and editor", async () => {
    for (const role of ["admin", "editor"] as const) {
      const token = signAdminToken({
        id: "admin-1",
        email: `${role}@example.com`,
        role,
        sessionVersion: 1,
      })
      readSessionToken.mockReturnValue({ token, source: "cookie" })
      const handler = vi.fn(async () => NextResponse.json({ ok: true }))
      const res = await withAdminOrEditor(handler)(makeAdminRequest(token), {
        params: Promise.resolve({}),
      })
      expect(res.status).toBe(200)
      expect(handler).toHaveBeenCalled()
    }
  })

  it("does not export optional-role withAdminAuth", async () => {
    const source = readFileSync(
      join(process.cwd(), "src/lib/admin-auth.ts"),
      "utf8",
    )
    expect(source).toContain("export function withAdminOnly")
    expect(source).toContain("export function withAdminOrEditor")
    expect(source).not.toMatch(/export function withAdminAuth\b/)
  })

  it("requires every admin API route to pick an explicit role entrypoint", () => {
    const adminRoot = join(process.cwd(), "src/app/api/admin")
    const files = listAdminRouteFiles(adminRoot)
    expect(files.length).toBeGreaterThan(20)

    const offenders: string[] = []
    for (const file of files) {
      const rel = relative(process.cwd(), file)
      if (rel.endsWith("auth/login/route.ts")) continue

      const source = readFileSync(file, "utf8")
      const usesOnly = source.includes("withAdminOnly")
      const usesEditor = source.includes("withAdminOrEditor")
      const usesLegacy = /\bwithAdminAuth\b/.test(source)
      if (usesLegacy || !(usesOnly || usesEditor)) {
        offenders.push(rel)
      }
    }

    expect(offenders).toEqual([])
  })

  it("keeps activation codes, AIM runs/traces, users, settings, audit, governance, approvals, and seed admin-only", () => {
    const mustBeAdminOnly = [
      "src/app/api/admin/activation-codes/route.ts",
      "src/app/api/admin/activation-codes/generate/route.ts",
      "src/app/api/admin/activation-codes/export/route.ts",
      "src/app/api/admin/activation-codes/stats/route.ts",
      "src/app/api/admin/aim/runs/route.ts",
      "src/app/api/admin/aim/runs/[runId]/route.ts",
      "src/app/api/admin/agents/traces/route.ts",
      "src/app/api/admin/agents/traces/[id]/route.ts",
      "src/app/api/admin/users/route.ts",
      "src/app/api/admin/settings/route.ts",
      "src/app/api/admin/audit-logs/route.ts",
      "src/app/api/admin/governance-assignments/route.ts",
      "src/app/api/admin/approval-decisions/route.ts",
      "src/app/api/admin/settings/seed/route.ts",
      "src/app/api/admin/seed-topic-engine/route.ts",
    ]

    for (const rel of mustBeAdminOnly) {
      const source = readFileSync(join(process.cwd(), rel), "utf8")
      expect(source, rel).toContain("withAdminOnly")
      expect(source, rel).not.toContain("withAdminOrEditor")
    }
  })

  it("keeps content-ops routes editor-capable", () => {
    const editorOk = [
      "src/app/api/admin/templates/route.ts",
      "src/app/api/admin/knowledge/route.ts",
      "src/app/api/admin/methodology/route.ts",
      "src/app/api/admin/methodology-profiles/route.ts",
      "src/app/api/admin/benchmark-profiles/route.ts",
    ]
    for (const rel of editorOk) {
      const source = readFileSync(join(process.cwd(), rel), "utf8")
      expect(source, rel).toContain("withAdminOrEditor")
    }
  })
})

describe("HTTP migrate route must stay deleted", () => {
  it("does not expose /api/admin/migrate", () => {
    expect(
      existsSync(join(process.cwd(), "src/app/api/admin/migrate/route.ts")),
    ).toBe(false)
  })
})
