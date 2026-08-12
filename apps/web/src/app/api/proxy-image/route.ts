import { NextRequest, NextResponse } from "next/server"
import { lookup } from "node:dns/promises"
import { incrementSecurityMetric } from "@/lib/security-metrics"
import {
  getImageCandidateUrls,
  getProxyClientKey,
  isDomainAllowed,
  isPrivateIpAddress,
  parseStrictContentLength,
  PROXY_IMAGE_MAX_BYTES,
  proxyImageGate,
  readStreamWithByteLimit,
} from "./proxy-image-utils"

async function isPublicAllowedTarget(value: string): Promise<boolean> {
  const target = new URL(value)
  if (!["http:", "https:"].includes(target.protocol) || !isDomainAllowed(target.hostname)) {
    return false
  }
  const addresses = await lookup(target.hostname, { all: true, verbatim: true })
  return addresses.length > 0 && addresses.every(({ address }) => !isPrivateIpAddress(address))
}

async function fetchAllowedUpstream(candidateUrls: string[]): Promise<Response | NextResponse> {
  let upstream: Response | null = null
  for (const targetUrl of candidateUrls) {
    if (!(await isPublicAllowedTarget(targetUrl))) {
      incrementSecurityMetric("proxy_image.reject", { reason: "private_resolution" })
      return NextResponse.json({ error: "Resolved address is not allowed" }, { status: 403 })
    }
    upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.douyin.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    })
    if (upstream.status >= 300 && upstream.status < 400) {
      incrementSecurityMetric("proxy_image.reject", { reason: "redirect" })
      return NextResponse.json({ error: "Upstream redirect rejected" }, { status: 502 })
    }
    if (upstream.ok) return upstream
  }
  incrementSecurityMetric("proxy_image.reject", { reason: "upstream_status" })
  return NextResponse.json(
    { error: `Upstream responded with ${upstream?.status ?? "unknown"}` },
    { status: 502 },
  )
}

async function streamImageResponse(upstream: Response): Promise<NextResponse> {
  const contentType = upstream.headers.get("content-type") ?? ""
  if (!contentType.startsWith("image/")) {
    incrementSecurityMetric("proxy_image.reject", { reason: "not_image" })
    await upstream.body?.cancel().catch(() => undefined)
    return NextResponse.json({ error: "Response is not an image" }, { status: 422 })
  }

  const lengthParse = parseStrictContentLength(upstream.headers.get("content-length"))
  if (lengthParse.status === "invalid") {
    incrementSecurityMetric("proxy_image.reject", { reason: "invalid_content_length" })
    await upstream.body?.cancel().catch(() => undefined)
    return NextResponse.json({ error: "Invalid Content-Length" }, { status: 400 })
  }
  if (lengthParse.status === "ok" && lengthParse.bytes > PROXY_IMAGE_MAX_BYTES) {
    incrementSecurityMetric("proxy_image.oversize", { reason: "declared_content_length" })
    await upstream.body?.cancel().catch(() => undefined)
    return NextResponse.json({ error: "Image exceeds maximum size" }, { status: 413 })
  }

  const read = await readStreamWithByteLimit(upstream.body, PROXY_IMAGE_MAX_BYTES)
  if (!read.ok) {
    if (read.reason === "oversize") {
      incrementSecurityMetric("proxy_image.oversize", { reason: "stream_oversize" })
      return NextResponse.json({ error: "Image exceeds maximum size" }, { status: 413 })
    }
    incrementSecurityMetric("proxy_image.reject", { reason: "empty_body" })
    return NextResponse.json({ error: "Empty image body" }, { status: 502 })
  }

  incrementSecurityMetric("proxy_image.ok")
  return new NextResponse(Buffer.from(read.bytes), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

function parseRequestUrl(request: NextRequest):
  | { ok: true; candidates: string[] }
  | { ok: false; response: NextResponse } {
  const url = request.nextUrl.searchParams.get("url")
  if (!url) {
    incrementSecurityMetric("proxy_image.reject", { reason: "missing_url" })
    return { ok: false, response: NextResponse.json({ error: "Missing url parameter" }, { status: 400 }) }
  }
  const candidates = getImageCandidateUrls(url)
  let parsed: URL
  try {
    parsed = new URL(candidates[0])
  } catch {
    incrementSecurityMetric("proxy_image.reject", { reason: "invalid_url" })
    return { ok: false, response: NextResponse.json({ error: "Invalid url" }, { status: 400 }) }
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    incrementSecurityMetric("proxy_image.reject", { reason: "invalid_protocol" })
    return { ok: false, response: NextResponse.json({ error: "Invalid protocol" }, { status: 400 }) }
  }
  if (!isDomainAllowed(parsed.hostname)) {
    incrementSecurityMetric("proxy_image.reject", { reason: "domain_not_allowed" })
    return { ok: false, response: NextResponse.json({ error: "Domain not allowed" }, { status: 403 }) }
  }
  return { ok: true, candidates }
}

/**
 * @description 处理 GET 请求：白名单域名图片代理，流式限长，防内存撑爆
 */
export async function GET(request: NextRequest) {
  const clientKey = getProxyClientKey(request)
  const gate = proxyImageGate.tryAcquire(clientKey)
  if (!gate.ok) {
    incrementSecurityMetric("proxy_image.rate_limited", { reason: gate.reason })
    return NextResponse.json(
      { error: gate.reason === "rate_limited" ? "Too many requests" : "Too many concurrent requests" },
      { status: 429 },
    )
  }

  try {
    const parsed = parseRequestUrl(request)
    if (!parsed.ok) return parsed.response
    const upstreamOrError = await fetchAllowedUpstream(parsed.candidates)
    if (upstreamOrError instanceof NextResponse) return upstreamOrError
    return await streamImageResponse(upstreamOrError)
  } catch {
    incrementSecurityMetric("proxy_image.reject", { reason: "fetch_error" })
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 })
  } finally {
    proxyImageGate.release()
  }
}
