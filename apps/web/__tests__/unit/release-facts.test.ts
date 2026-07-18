import { describe, expect, it } from "vitest"

import {
  computeFeishuWorkItemReady,
  computeProxyReady,
  parseReleaseManifest,
  resolveReleaseFacts,
  FEISHU_WORK_ITEM_REQUIRED_ENV,
} from "@/lib/release-facts"

describe("parseReleaseManifest", () => {
  it("accepts a plain object", () => {
    expect(parseReleaseManifest({ releaseSha: "abc123" })).toEqual({ releaseSha: "abc123" })
  })

  it("rejects null / arrays / primitives", () => {
    expect(parseReleaseManifest(null)).toBeNull()
    expect(parseReleaseManifest(undefined)).toBeNull()
    expect(parseReleaseManifest([1, 2])).toBeNull()
    expect(parseReleaseManifest("sha")).toBeNull()
    expect(parseReleaseManifest(42)).toBeNull()
  })
})

describe("resolveReleaseFacts", () => {
  it("prefers manifest values over environment variables", () => {
    const facts = resolveReleaseFacts(
      { releaseSha: "  8e75c92 ", buildTime: "2026-07-18T02:00:00Z", version: "0.1.0" },
      { RELEASE_SHA: "older", RELEASE_BUILD_TIME: "older", RELEASE_VERSION: "0.0.0" },
    )
    expect(facts).toEqual({
      releaseSha: "8e75c92",
      buildTime: "2026-07-18T02:00:00Z",
      version: "0.1.0",
    })
  })

  it("falls back to environment variables when manifest is absent", () => {
    const facts = resolveReleaseFacts(null, {
      RELEASE_SHA: "abc",
      RELEASE_BUILD_TIME: "2026-07-18T00:00:00Z",
      RELEASE_VERSION: "1.2.3",
    })
    expect(facts).toEqual({
      releaseSha: "abc",
      buildTime: "2026-07-18T00:00:00Z",
      version: "1.2.3",
    })
  })

  it("returns unknown for every missing fact（本地开发不伪造版本事实）", () => {
    expect(resolveReleaseFacts(null, {})).toEqual({
      releaseSha: "unknown",
      buildTime: "unknown",
      version: "unknown",
    })
  })

  it("ignores blank manifest fields and uses the env fallback", () => {
    const facts = resolveReleaseFacts(
      { releaseSha: "   ", buildTime: "", version: null },
      { RELEASE_SHA: "env-sha", npm_package_version: "0.1.0" },
    )
    expect(facts.releaseSha).toBe("env-sha")
    expect(facts.buildTime).toBe("unknown")
    expect(facts.version).toBe("0.1.0")
  })
})

describe("computeFeishuWorkItemReady", () => {
  it("requires all five work-item env vars（阶段 1.1 清单）", () => {
    const full: Record<string, string> = {}
    for (const name of FEISHU_WORK_ITEM_REQUIRED_ENV) full[name] = "x"
    expect(computeFeishuWorkItemReady(full)).toBe(true)

    for (const missing of FEISHU_WORK_ITEM_REQUIRED_ENV) {
      const partial = { ...full }
      delete partial[missing]
      expect(computeFeishuWorkItemReady(partial), `missing ${missing}`).toBe(false)
    }
  })

  it("treats blank values as not configured", () => {
    const env: Record<string, string> = {}
    for (const name of FEISHU_WORK_ITEM_REQUIRED_ENV) env[name] = "x"
    env.LARK_CLI_PATH = "   "
    expect(computeFeishuWorkItemReady(env)).toBe(false)
  })
})

describe("computeProxyReady", () => {
  it("is true only when APIMART_PROXY_URL is configured", () => {
    expect(computeProxyReady({ APIMART_PROXY_URL: "http://127.0.0.1:10808" })).toBe(true)
    expect(computeProxyReady({ APIMART_PROXY_URL: "  " })).toBe(false)
    expect(computeProxyReady({})).toBe(false)
  })
})
