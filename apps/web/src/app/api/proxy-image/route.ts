import { NextRequest, NextResponse } from "next/server"

import { incrementSecurityMetric } from "@/lib/security-metrics"
import { createPinnedAgent, resolvePublicTarget, type PublicTarget } from "@/lib/ssrf-guard.server"
import {
  getImageCandidateUrls,
  getProxyClientKey,
  isDomainAllowed,
  parseStrictContentLength,
  PROXY_IMAGE_MAX_BYTES,
  proxyImageGate,
  readStreamWithByteLimit,
} from "./proxy-image-utils"

// SSRF 守卫依赖 node:dns / undici 钉 IP 连接，必须跑在 Node 运行时；
// 显式声明以免将来被改成 edge runtime 后守卫静默失效。
export const runtime = "nodejs"

/**
 * 解析并校验候选 URL：域名白名单 + **共享 SSRF 校验源**（全部解析地址均公网、禁内嵌凭据）。
 *
 * 返回 {@link PublicTarget}（含首次解析通过的地址），供调用方把连接钉死在该地址上，
 * 消除「先解析校验 → fetch 自己再解析一次」的 DNS 重绑定窗口（TOCTOU）。
 * 失败一律返回 null，由调用方统一降级，不区分具体原因避免向调用者泄漏内网拓扑信息。
 */
async function resolveAllowedTarget(value: string): Promise<PublicTarget | null> {
  try {
    const target = await resolvePublicTarget(value)
    return isDomainAllowed(target.url.hostname) ? target : null
  } catch {
    return null
  }
}

async function fetchAllowedUpstream(
  candidateUrls: string[],
  agents: Array<ReturnType<typeof createPinnedAgent>>,
): Promise<Response | NextResponse> {
  let upstream: Response | null = null
  for (const targetUrl of candidateUrls) {
    const target = await resolveAllowedTarget(targetUrl)
    if (!target) {
      incrementSecurityMetric("proxy_image.reject", { reason: "private_resolution" })
      return NextResponse.json({ error: "Resolved address is not allowed" }, { status: 403 })
    }

    // 把实际连接钉在「首次校验通过」的那个地址上，使 DNS 重绑定无机可乘。
    // 主机名仍保持原域名，因此 TLS SNI 与证书校验照旧生效 —— 这点是不能用
    // 「把 hostname 直接换成 IP」来实现的，那会破坏证书校验。
    const agent = createPinnedAgent(target.address, target.family)
    agents.push(agent)

    upstream = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.douyin.com/",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
      dispatcher: agent,
    } as unknown as RequestInit)

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

  // 钉 IP 用的 undici Agent 必须在「响应 body 读完之后」才能关闭，
  // 否则连接池销毁会掐断尚未流式读完的上游响应，因此统一在出口回收。
  const agents: Array<ReturnType<typeof createPinnedAgent>> = []

  try {
    const parsed = parseRequestUrl(request)
    if (!parsed.ok) return parsed.response
    const upstreamOrError = await fetchAllowedUpstream(parsed.candidates, agents)
    if (upstreamOrError instanceof NextResponse) return upstreamOrError
    return await streamImageResponse(upstreamOrError)
  } catch {
    incrementSecurityMetric("proxy_image.reject", { reason: "fetch_error" })
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 502 })
  } finally {
    proxyImageGate.release()
    for (const agent of agents) {
      void agent.close().catch(() => undefined)
    }
  }
}
