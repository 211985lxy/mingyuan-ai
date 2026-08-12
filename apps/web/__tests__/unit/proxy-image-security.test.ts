import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => [{ address: "203.0.113.10", family: 4 }]),
}))

vi.mock("@/lib/security-metrics", () => ({
  incrementSecurityMetric: vi.fn(),
}))

import { GET } from "@/app/api/proxy-image/route"
import {
  PROXY_IMAGE_MAX_BYTES,
  ProxyImageGate,
  parseStrictContentLength,
  proxyImageGate,
  readStreamWithByteLimit,
} from "@/app/api/proxy-image/proxy-image-utils"

function imageUrl(path = "/a.jpg") {
  return `https://p3.douyinpic.com${path}`
}

function makeRequest(url: string, headers?: Record<string, string>) {
  const target = new URL("http://localhost/api/proxy-image")
  target.searchParams.set("url", url)
  return new NextRequest(target, { headers })
}

function chunkedBody(totalBytes: number, chunkSize = 64 * 1024): ReadableStream<Uint8Array> {
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close()
        return
      }
      const size = Math.min(chunkSize, totalBytes - sent)
      controller.enqueue(new Uint8Array(size).fill(1))
      sent += size
    },
  })
}

describe("parseStrictContentLength", () => {
  it("accepts missing and pure numeric lengths", () => {
    expect(parseStrictContentLength(null)).toEqual({ status: "missing" })
    expect(parseStrictContentLength("")).toEqual({ status: "missing" })
    expect(parseStrictContentLength("1024")).toEqual({ status: "ok", bytes: 1024 })
  })

  it("rejects non-numeric and negative values", () => {
    expect(parseStrictContentLength("-1")).toEqual({ status: "invalid" })
    expect(parseStrictContentLength("12.5")).toEqual({ status: "invalid" })
    expect(parseStrictContentLength("1e3")).toEqual({ status: "invalid" })
    expect(parseStrictContentLength("abc")).toEqual({ status: "invalid" })
  })
})

describe("readStreamWithByteLimit", () => {
  it("aborts without assembling an oversize buffer when Content-Length is missing", async () => {
    const oversize = PROXY_IMAGE_MAX_BYTES + 8 * 1024
    const result = await readStreamWithByteLimit(chunkedBody(oversize, 128 * 1024), PROXY_IMAGE_MAX_BYTES)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("oversize")
  })

  it("returns bytes when under the limit", async () => {
    const result = await readStreamWithByteLimit(chunkedBody(1024, 256), PROXY_IMAGE_MAX_BYTES)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.bytes.byteLength).toBe(1024)
  })
})

describe("GET /api/proxy-image", () => {
  beforeEach(() => {
    proxyImageGate.resetForTests()
    vi.stubGlobal("fetch", vi.fn())
  })

  afterEach(() => {
    proxyImageGate.resetForTests()
    vi.unstubAllGlobals()
  })

  it("rejects upstream redirects", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "https://evil.example/x.jpg" },
      }),
    )

    const res = await GET(makeRequest(imageUrl()))
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ error: "Upstream redirect rejected" })
  })

  it("rejects forged Content-Length that exceeds the cap without reading the body", async () => {
    let readerOpened = false
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16).fill(1))
        controller.close()
      },
      cancel() {
        // cancelled by route when declared length is oversize
      },
    })
    const originalGetReader = body.getReader.bind(body)
    body.getReader = ((...args: Parameters<ReadableStream["getReader"]>) => {
      readerOpened = true
      return originalGetReader(...args)
    }) as ReadableStream["getReader"]

    vi.mocked(fetch).mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": String(PROXY_IMAGE_MAX_BYTES + 1),
        },
      }),
    )

    const res = await GET(makeRequest(imageUrl()))
    expect(res.status).toBe(413)
    expect(readerOpened).toBe(false)
  })

  it("stream-aborts when Content-Length is forged low but body exceeds 5MiB", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(chunkedBody(PROXY_IMAGE_MAX_BYTES + 64 * 1024, 256 * 1024), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "128",
        },
      }),
    )

    const res = await GET(makeRequest(imageUrl()))
    expect(res.status).toBe(413)
  })

  it("stream-aborts when Content-Length is missing but body exceeds 5MiB", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(chunkedBody(PROXY_IMAGE_MAX_BYTES + 64 * 1024, 256 * 1024), {
        status: 200,
        headers: { "content-type": "image/jpeg" },
      }),
    )

    const res = await GET(makeRequest(imageUrl()))
    expect(res.status).toBe(413)
  })

  it("rate limits to 60 requests per minute per IP", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(chunkedBody(16), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
          "content-length": "16",
        },
      }),
    )

    const headers = { "x-real-ip": "198.51.100.9" }
    for (let i = 0; i < 60; i += 1) {
      const res = await GET(makeRequest(imageUrl(`/n-${i}.jpg`), headers))
      expect(res.status).toBe(200)
    }
    const limited = await GET(makeRequest(imageUrl("/over.jpg"), headers))
    expect(limited.status).toBe(429)
  })
})

describe("ProxyImageGate concurrent limit", () => {
  it("rejects when instance concurrent slots are exhausted", () => {
    const gate = new ProxyImageGate(1000, 2)
    expect(gate.tryAcquire("a").ok).toBe(true)
    expect(gate.tryAcquire("b").ok).toBe(true)
    expect(gate.tryAcquire("c")).toEqual({ ok: false, reason: "too_many_concurrent" })
    gate.release()
    expect(gate.tryAcquire("c").ok).toBe(true)
  })
})
