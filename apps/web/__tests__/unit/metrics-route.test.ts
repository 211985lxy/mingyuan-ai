import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const metrics = vi.hoisted(() => vi.fn(async () => "# HELP test\n"))
vi.mock("@/env", () => ({ env: { METRICS_SCRAPE_SECRET: "metrics-secret-with-at-least-32-characters" } }))
vi.mock("@/lib/metrics", () => ({ metricsRegistry: { metrics, contentType: "text/plain" } }))

import { GET } from "@/app/api/metrics/route"

describe("metrics scrape authentication", () => {
  it("rejects anonymous and wrong bearer requests", async () => {
    expect((await GET(new NextRequest("http://localhost/api/metrics"))).status).toBe(401)
    expect((await GET(new NextRequest("http://localhost/api/metrics", { headers: { authorization: "Bearer wrong" } }))).status).toBe(401)
    expect(metrics).not.toHaveBeenCalled()
  })

  it("serves metrics only with the configured bearer secret", async () => {
    const response = await GET(new NextRequest("http://localhost/api/metrics", { headers: { authorization: "Bearer metrics-secret-with-at-least-32-characters" } }))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("text/plain")
  })
})
