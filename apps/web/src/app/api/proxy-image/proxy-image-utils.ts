/**
 * proxy-image route 的工具函数。
 * 独立于 route.ts，避免 Next.js App Router 对 route 模块非 handler 导出的类型推断干扰。
 */

import type { NextRequest } from "next/server"

import { isIpLiteral, isPublicIp } from "@/lib/ssrf-guard"

const ALLOWED_DOMAINS = [
  "douyinpic.com",
  "douyinpics.com",
  "douyincdn.com",
  "douyinstatic.com",
  "byteimg.com",
  "pstatp.com",
  "snssdk.com",
  "xiaohongshu.com",
  "xhscdn.com",
  "xhslink.com",
]

export const PROXY_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const PROXY_IMAGE_RATE_PER_MINUTE = 60
export const PROXY_IMAGE_MAX_CONCURRENT = 50

/**
 * @description 判断是否domainallowed
 */
export function isDomainAllowed(hostname: string): boolean {
  return ALLOWED_DOMAINS.some(
    (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
  )
}

/**
 * @description 获取imagecandidateurls
 */
export function getImageCandidateUrls(url: string): string[] {
  if (!url.includes(".heic")) return [url]

  const candidates = [
    url.replace(/\.heic/g, ".webp"),
    url.replace(/\.heic/g, ".jpeg"),
    url.replace(/\.heic/g, ".jpg"),
    url,
  ]
  return [...new Set(candidates.filter(Boolean))]
}

/**
 * @description 判断是否为私网/保留 IP —— 复用 SSRF 共享校验源的唯一出口
 */
export function isPrivateIpAddress(address: string): boolean {
  // 非 IP 字面量（域名）不做判定，返回 false —— 与调用方契约一致：
  // 本函数只用于判定「DNS 解析结果」，域名不应走到这里。
  // 这样保证误传域名时不会被当成「私有」而误杀。
  if (!isIpLiteral(address)) return false
  return !isPublicIp(address)
}

export type ContentLengthParse =
  | { status: "missing" }
  | { status: "ok"; bytes: number }
  | { status: "invalid" }

/**
 * @description 严格解析 Content-Length：缺省可流式读；非数字/负数拒绝
 */
export function parseStrictContentLength(header: string | null): ContentLengthParse {
  if (header === null) return { status: "missing" }
  const trimmed = header.trim()
  if (trimmed === "") return { status: "missing" }
  if (!/^\d+$/.test(trimmed)) return { status: "invalid" }
  const bytes = Number(trimmed)
  if (!Number.isSafeInteger(bytes)) return { status: "invalid" }
  return { status: "ok", bytes }
}

/**
 * @description 流式读取上游 body，累计超过上限立即 cancel，不拼出超限整包
 */
export async function readStreamWithByteLimit(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
): Promise<
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "oversize" | "empty_body" }
> {
  if (!body) return { ok: false, reason: "empty_body" }

  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value?.byteLength) continue
      total += value.byteLength
      if (total > maxBytes) {
        chunks.length = 0
        await reader.cancel("oversize")
        return { ok: false, reason: "oversize" }
      }
      chunks.push(value)
    }
  } catch {
    chunks.length = 0
    try {
      await reader.cancel("read_error")
    } catch {
      // ignore
    }
    return { ok: false, reason: "empty_body" }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      // already cancelled
    }
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes: out }
}

/**
 * @description 取代理限流键：优先可信头，否则回落到 unknown（按连接来源桶限制）
 */
export function getProxyClientKey(request: NextRequest): string {
  const cf = request.headers.get("cf-connecting-ip")?.trim()
  if (cf) return cf
  const realIp = request.headers.get("x-real-ip")?.trim()
  if (realIp) return realIp
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  if (forwarded) return forwarded
  return "unknown"
}

type MinuteBucket = { windowStart: number; count: number }

/**
 * 进程内图片代理门闩：每 IP 每分钟次数 + 实例并发。
 */
export class ProxyImageGate {
  private minuteBuckets = new Map<string, MinuteBucket>()
  private concurrent = 0

  constructor(
    private readonly maxPerMinute = PROXY_IMAGE_RATE_PER_MINUTE,
    private readonly maxConcurrent = PROXY_IMAGE_MAX_CONCURRENT,
  ) {}

  /**
   * @description 尝试占一个并发名额并计入分钟窗口
   */
  tryAcquire(clientKey: string):
    | { ok: true }
    | { ok: false; reason: "rate_limited" | "too_many_concurrent" } {
    if (this.concurrent >= this.maxConcurrent) {
      return { ok: false, reason: "too_many_concurrent" }
    }

    const now = Date.now()
    const windowMs = 60_000
    const bucket = this.minuteBuckets.get(clientKey)
    if (!bucket || now - bucket.windowStart >= windowMs) {
      this.minuteBuckets.set(clientKey, { windowStart: now, count: 1 })
    } else {
      if (bucket.count >= this.maxPerMinute) {
        return { ok: false, reason: "rate_limited" }
      }
      bucket.count += 1
    }

    if (this.minuteBuckets.size > 20_000) {
      for (const [key, value] of this.minuteBuckets) {
        if (now - value.windowStart >= windowMs) this.minuteBuckets.delete(key)
      }
    }

    this.concurrent += 1
    return { ok: true }
  }

  /**
   * @description 释放并发名额
   */
  release(): void {
    this.concurrent = Math.max(0, this.concurrent - 1)
  }

  /**
   * @description 测试用重置
   */
  resetForTests(): void {
    this.minuteBuckets.clear()
    this.concurrent = 0
  }

  getConcurrentForTests(): number {
    return this.concurrent
  }
}

export const proxyImageGate = new ProxyImageGate()
