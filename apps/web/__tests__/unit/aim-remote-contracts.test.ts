import { describe, expect, it } from "vitest"
import {
  AGENT_SCOPE,
  AGENT_SCOPES,
  AGENT_CLIENT_TYPES,
  CODEX_DEFAULT_SCOPES,
  WORKBUDDY_DEFAULT_SCOPES,
  REMOTE_INVOCATION_STATUS,
  REMOTE_ERROR_CODE,
  remoteErrorStatus,
  defaultScopesForClientType,
} from "@/lib/aim-remote/contracts"
import { computeRequestHash } from "@/lib/aim-remote/invocation-service"

describe("aim-remote contracts", () => {
  describe("AGENT_SCOPE constants", () => {
    it("defines all 10 expected scopes", () => {
      expect(AGENT_SCOPES).toHaveLength(10)
      expect(AGENT_SCOPE.capabilitiesRead).toBe("capabilities.read")
      expect(AGENT_SCOPE.draftsSubmit).toBe("drafts.submit")
      expect(AGENT_SCOPE.repliesClaim).toBe("replies.claim")
      expect(AGENT_SCOPE.inspirationIngest).toBe("inspiration.ingest")
      expect(AGENT_SCOPE.knowledgeConfirm).toBe("knowledge.confirm")
    })

    it("codex preset has read + draft + poll scopes, no inspiration/reply scopes", () => {
      expect(CODEX_DEFAULT_SCOPES).toContain(AGENT_SCOPE.draftsSubmit)
      expect(CODEX_DEFAULT_SCOPES).toContain(AGENT_SCOPE.invocationsRead)
      expect(CODEX_DEFAULT_SCOPES).not.toContain(AGENT_SCOPE.repliesClaim)
      expect(CODEX_DEFAULT_SCOPES).not.toContain(AGENT_SCOPE.inspirationIngest)
    })

    it("workbuddy preset has inspiration + reply scopes, no draft scope", () => {
      expect(WORKBUDDY_DEFAULT_SCOPES).toContain(AGENT_SCOPE.inspirationIngest)
      expect(WORKBUDDY_DEFAULT_SCOPES).toContain(AGENT_SCOPE.repliesClaim)
      expect(WORKBUDDY_DEFAULT_SCOPES).not.toContain(AGENT_SCOPE.draftsSubmit)
      expect(WORKBUDDY_DEFAULT_SCOPES).not.toContain(AGENT_SCOPE.invocationsRead)
    })

    it("codex and workbuddy presets are disjoint (no shared scope)", () => {
      const codexSet = new Set(CODEX_DEFAULT_SCOPES)
      const shared = WORKBUDDY_DEFAULT_SCOPES.filter((s) => codexSet.has(s))
      expect(shared).toEqual([])
    })
  })

  describe("defaultScopesForClientType", () => {
    it("returns codex preset for codex", () => {
      expect(defaultScopesForClientType("codex")).toEqual(CODEX_DEFAULT_SCOPES)
    })
    it("returns workbuddy preset for workbuddy", () => {
      expect(defaultScopesForClientType("workbuddy")).toEqual(WORKBUDDY_DEFAULT_SCOPES)
    })
    it("returns empty array for custom", () => {
      expect(defaultScopesForClientType("custom")).toEqual([])
    })
    it("returns a fresh array copy (mutations do not leak)", () => {
      const a = defaultScopesForClientType("codex")
      a.push("injected" as never)
      const b = defaultScopesForClientType("codex")
      expect(b).not.toContain("injected")
    })
  })

  describe("AGENT_CLIENT_TYPES", () => {
    it("includes codex, workbuddy, custom", () => {
      expect(AGENT_CLIENT_TYPES).toEqual(["codex", "workbuddy", "custom"])
    })
  })

  describe("REMOTE_INVOCATION_STATUS", () => {
    it("has the four lifecycle statuses", () => {
      expect(REMOTE_INVOCATION_STATUS.queued).toBe("queued")
      expect(REMOTE_INVOCATION_STATUS.running).toBe("running")
      expect(REMOTE_INVOCATION_STATUS.succeeded).toBe("succeeded")
      expect(REMOTE_INVOCATION_STATUS.failed).toBe("failed")
    })
  })

  describe("remoteErrorStatus", () => {
    it("maps IDEMPOTENCY_CONFLICT to 409", () => {
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.IDEMPOTENCY_CONFLICT)).toBe(409)
    })
    it("maps scope/key forbidden errors to 401/403", () => {
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.KEY_DISABLED)).toBe(401)
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.KEY_EXPIRED)).toBe(401)
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.SCOPE_DENIED)).toBe(403)
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.INVOCATION_FORBIDDEN)).toBe(403)
    })
    it("maps quota errors to 429", () => {
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.DAILY_TOKEN_EXCEEDED)).toBe(429)
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.MINUTE_LIMIT_EXCEEDED)).toBe(429)
    })
    it("maps input validation errors to 400", () => {
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.INPUT_TOO_LARGE)).toBe(400)
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.INVALID_AGENT)).toBe(400)
    })
    it("maps not-found to 404 and feature-disabled to 503", () => {
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.INVOCATION_NOT_FOUND)).toBe(404)
      expect(remoteErrorStatus(REMOTE_ERROR_CODE.REMOTE_FEATURE_DISABLED)).toBe(503)
    })
  })

  describe("computeRequestHash", () => {
    it("is deterministic for identical inputs", () => {
      const input = {
        idempotencyKey: "key-123",
        projectId: "proj-1",
        agentId: "content_producer" as never,
        rawInput: "写一条短视频文案",
        targetFormats: ["video_script", "moments_post"] as never,
      }
      expect(computeRequestHash(input)).toBe(computeRequestHash(input))
    })

    it("is order-independent for targetFormats", () => {
      const a = computeRequestHash({
        idempotencyKey: "k", projectId: "p", agentId: "content_producer" as never,
        rawInput: "x", targetFormats: ["video_script", "moments_post"] as never,
      })
      const b = computeRequestHash({
        idempotencyKey: "k", projectId: "p", agentId: "content_producer" as never,
        rawInput: "x", targetFormats: ["moments_post", "video_script"] as never,
      })
      expect(a).toBe(b)
    })

    it("differs when rawInput changes", () => {
      const a = computeRequestHash({
        idempotencyKey: "k", projectId: "p", agentId: "content_producer" as never,
        rawInput: "原始输入", targetFormats: ["video_script"] as never,
      })
      const b = computeRequestHash({
        idempotencyKey: "k", projectId: "p", agentId: "content_producer" as never,
        rawInput: "改过的输入", targetFormats: ["video_script"] as never,
      })
      expect(a).not.toBe(b)
    })

    it("differs when agentId changes", () => {
      const a = computeRequestHash({
        idempotencyKey: "k", projectId: "p", agentId: "content_producer" as never,
        rawInput: "x", targetFormats: ["video_script"] as never,
      })
      const b = computeRequestHash({
        idempotencyKey: "k", projectId: "p", agentId: "work_editor" as never,
        rawInput: "x", targetFormats: ["video_script"] as never,
      })
      expect(a).not.toBe(b)
    })
  })
})
