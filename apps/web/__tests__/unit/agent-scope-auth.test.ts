import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the feature flag so we can toggle enforcement on/off per test.
const flagMock = vi.hoisted(() => ({ enforced: false }))
vi.mock("@/lib/aim-remote/feature-flags", () => ({
  areScopesEnforced: () => flagMock.enforced,
  isMcpEnabled: () => false,
  isRemoteInvocationsEnabled: () => false,
  getAllowedMcpHosts: () => ["mingyuan-ai.cn"],
}))

import { assertAgentScope, buildAgentApiContext, readStringArray, type AgentApiContext } from "@/lib/agent-api-auth"
import { AGENT_SCOPE } from "@/lib/aim-remote/contracts"

function makeContext(overrides: Partial<AgentApiContext> = {}): AgentApiContext {
  return {
    apiKeyId: "key-1",
    userId: "user-1",
    allowedProjects: ["proj-1"],
    allowedAgents: [],
    clientType: "codex",
    allowedScopes: [AGENT_SCOPE.draftsSubmit, AGENT_SCOPE.invocationsRead],
    expiresAt: null,
    maxInputChars: 50000,
    minuteLimit: 60,
    dailyTokenLimit: null,
    ...overrides,
  }
}

describe("assertAgentScope", () => {
  beforeEach(() => {
    flagMock.enforced = false
  })

  it("is a no-op when scopes are NOT enforced (legacy backward-compat)", () => {
    flagMock.enforced = false
    const ctx = makeContext({ allowedScopes: [] }) // empty scopes
    expect(() => assertAgentScope(ctx, AGENT_SCOPE.draftsSubmit)).not.toThrow()
  })

  it("passes when enforced and scope is present", () => {
    flagMock.enforced = true
    const ctx = makeContext({ allowedScopes: [AGENT_SCOPE.draftsSubmit] })
    expect(() => assertAgentScope(ctx, AGENT_SCOPE.draftsSubmit)).not.toThrow()
  })

  it("throws SCOPE_DENIED when enforced and scope is missing", () => {
    flagMock.enforced = true
    const ctx = makeContext({ allowedScopes: [AGENT_SCOPE.draftsSubmit] })
    expect(() => assertAgentScope(ctx, AGENT_SCOPE.repliesClaim)).toThrow("SCOPE_DENIED")
  })

  it("is fail-closed: empty scope list throws when enforced", () => {
    flagMock.enforced = true
    const ctx = makeContext({ allowedScopes: [] })
    expect(() => assertAgentScope(ctx, AGENT_SCOPE.capabilitiesRead)).toThrow("SCOPE_DENIED")
  })

  it("Codex key cannot claim WorkBuddy replies when enforced", () => {
    flagMock.enforced = true
    const codexCtx = makeContext({
      clientType: "codex",
      allowedScopes: [AGENT_SCOPE.draftsSubmit, AGENT_SCOPE.invocationsRead, AGENT_SCOPE.capabilitiesRead, AGENT_SCOPE.projectsRead],
    })
    expect(() => assertAgentScope(codexCtx, AGENT_SCOPE.repliesClaim)).toThrow("SCOPE_DENIED")
    expect(() => assertAgentScope(codexCtx, AGENT_SCOPE.inspirationIngest)).toThrow("SCOPE_DENIED")
  })

  it("WorkBuddy key cannot submit drafts when enforced", () => {
    flagMock.enforced = true
    const workbuddyCtx = makeContext({
      clientType: "workbuddy",
      allowedScopes: [AGENT_SCOPE.inspirationIngest, AGENT_SCOPE.inspirationStatusRead, AGENT_SCOPE.repliesClaim, AGENT_SCOPE.repliesAck],
    })
    expect(() => assertAgentScope(workbuddyCtx, AGENT_SCOPE.draftsSubmit)).toThrow("SCOPE_DENIED")
    expect(() => assertAgentScope(workbuddyCtx, AGENT_SCOPE.inspirationIngest)).not.toThrow()
  })
})

describe("buildAgentApiContext", () => {
  it("falls back to defaults for legacy keys missing V2.1 columns", () => {
    const ctx = buildAgentApiContext({
      id: "legacy-1",
      userId: "user-1",
      allowedProjects: ["proj-1"],
      allowedAgents: ["content_producer"],
      clientType: null, // legacy key
      allowedScopes: "[]",
      minuteLimit: null,
      dailyTokenLimit: null,
      maxInputChars: null,
      expiresAt: null,
    })
    expect(ctx.clientType).toBeNull()
    expect(ctx.allowedScopes).toEqual([])
    expect(ctx.maxInputChars).toBe(50000)
    expect(ctx.minuteLimit).toBe(60)
    expect(ctx.dailyTokenLimit).toBeNull()
    expect(ctx.expiresAt).toBeNull()
  })

  it("populates V2.1 columns when present", () => {
    const future = new Date(Date.now() + 86400000)
    const ctx = buildAgentApiContext({
      id: "new-1",
      userId: "user-1",
      allowedProjects: ["proj-1"],
      allowedAgents: [],
      clientType: "codex",
      allowedScopes: [AGENT_SCOPE.draftsSubmit],
      minuteLimit: 3,
      dailyTokenLimit: 100000,
      maxInputChars: 40000,
      expiresAt: future,
    })
    expect(ctx.clientType).toBe("codex")
    expect(ctx.allowedScopes).toEqual([AGENT_SCOPE.draftsSubmit])
    expect(ctx.minuteLimit).toBe(3)
    expect(ctx.dailyTokenLimit).toBe(100000)
    expect(ctx.maxInputChars).toBe(40000)
    expect(ctx.expiresAt).toEqual(future)
  })
})

describe("readStringArray", () => {
  it("returns strings from a valid array", () => {
    expect(readStringArray(["a", "b"])).toEqual(["a", "b"])
  })
  it("filters out non-string entries", () => {
    expect(readStringArray(["a", 1, null, "b"])).toEqual(["a", "b"])
  })
  it("returns empty array for non-array input", () => {
    expect(readStringArray(null)).toEqual([])
    expect(readStringArray(undefined)).toEqual([])
    expect(readStringArray("not-an-array")).toEqual([])
  })
})
