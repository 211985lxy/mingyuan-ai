import { describe, expect, it } from "vitest"

import { getAllowedMcpHosts, isAllowedMcpHost } from "@/lib/aim-remote/feature-flags"

describe("MCP host allowlist", () => {
  it("accepts the configured host and its subdomains, not a lookalike suffix", () => {
    const [host] = getAllowedMcpHosts()
    expect(host).toBeTruthy()
    expect(isAllowedMcpHost(host)).toBe(true)
    expect(isAllowedMcpHost(`${host}:443`)).toBe(true)
    expect(isAllowedMcpHost(`www.${host}`)).toBe(true)
    expect(isAllowedMcpHost(`evil${host}`)).toBe(false)
    expect(isAllowedMcpHost(null)).toBe(false)
  })
})