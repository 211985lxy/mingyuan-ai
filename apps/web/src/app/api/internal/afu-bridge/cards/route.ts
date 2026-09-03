import { NextRequest, NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { env } from "@/env"

const MAX_BODY_BYTES = 200 * 1024
const SOURCE_AFU_BRIDGE = "afu_bridge"
const LOCALHOST_IPS = new Set(["127.0.0.1", "::1", "localhost"])

const FIELD_LABELS: Record<string, string> = {
  audience: "受众",
  pain: "痛点",
  core_claim: "核心主张",
  platforms: "发布平台",
}

type FrontmatterSubset = {
  audience?: unknown
  pain?: unknown
  core_claim?: unknown
  platforms?: unknown
}

type NormalizedBody = {
  title: string
  frontmatterSubset?: FrontmatterSubset
  sourceUrl?: string
  dedupeKey: string
}

type ValidationIssue = { path: string; message: string }

/**
 * @description 从请求中读取直连客户端 IP（不信任代理头）。
 *   仅使用 Next.js 注入的 `ip` 扩展字段与 socket 直连地址。
 *   无法识别时返回 undefined（调用方应拒绝）。
 */
function getRemoteIp(request: NextRequest): string | undefined {
  const extended = request as NextRequest & { ip?: string; socketAddress?: { address?: string } }
  const extendedIp = extended.ip?.trim()
  if (extendedIp) return extendedIp

  const sockAddr = extended.socketAddress?.address?.trim()
  if (sockAddr) return sockAddr

  // 注：不信任 x-forwarded-for / x-real-ip 等代理头——本地端点应只接受直连 127.0.0.1。
  // 代理头可被客户端伪造，会导致 IP 门禁被绕过。
  return undefined
}

function isAllowedIp(ip: string): boolean {
  const normalized = ip.replace(/^\[|\]$/g, "").trim()
  if (LOCALHOST_IPS.has(normalized)) return true
  if (normalized.toLowerCase() === "::ffff:127.0.0.1") return true
  return false
}

function buildContent(title: string, fm: FrontmatterSubset | undefined): string {
  const titlePart = title
  const fmEntries = Object.entries(fm ?? {}).filter(([, value]) => {
    if (value === undefined || value === null) return false
    if (typeof value === "string") return value.trim().length > 0
    if (Array.isArray(value)) return value.length > 0
    return true
  })
  if (fmEntries.length === 0) return titlePart
  const fmLines = fmEntries.map(([key, value]) => {
    const label = FIELD_LABELS[key] ?? key
    let display: string
    if (Array.isArray(value)) {
      display = value
        .map((v) => (typeof v === "string" ? v.trim() : String(v)))
        .filter((v) => v.length > 0)
        .join("、")
    } else {
      display = typeof value === "string" ? value.trim() : String(value)
    }
    return `${label}：${display}`
  })
  return `${titlePart}\n\n${fmLines.join("\n")}`
}

function validateBody(raw: unknown): { value: NormalizedBody; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    issues.push({ path: "", message: "request body must be a JSON object" })
    return { value: {} as NormalizedBody, issues }
  }
  const record = raw as Record<string, unknown>

  let title = ""
  const rawTitle = record.title
  if (typeof rawTitle !== "string") {
    issues.push({ path: "title", message: "title must be a string" })
  } else {
    title = rawTitle.trim()
    if (title.length === 0) issues.push({ path: "title", message: "title must not be empty after trim" })
    else if (rawTitle.length > 300) issues.push({ path: "title", message: "title exceeds 300 chars" })
  }

  let dedupeKey = ""
  const rawDedupe = record.dedupeKey
  if (typeof rawDedupe !== "string") {
    issues.push({ path: "dedupeKey", message: "dedupeKey must be a string" })
  } else {
    dedupeKey = rawDedupe
    if (dedupeKey.length === 0) issues.push({ path: "dedupeKey", message: "dedupeKey must not be empty" })
    else if (dedupeKey.length > 191) issues.push({ path: "dedupeKey", message: "dedupeKey exceeds 191 chars" })
  }

  let sourceUrl: string | undefined
  if (record.sourceUrl !== undefined) {
    if (typeof record.sourceUrl !== "string") {
      issues.push({ path: "sourceUrl", message: "sourceUrl must be a string when provided" })
    } else if ((record.sourceUrl as string).length > 800) {
      issues.push({ path: "sourceUrl", message: "sourceUrl exceeds 800 chars" })
    } else {
      sourceUrl = (record.sourceUrl as string).trim() || undefined
    }
  }

  let frontmatterSubset: FrontmatterSubset | undefined
  if (record.frontmatterSubset !== undefined) {
    if (!record.frontmatterSubset || typeof record.frontmatterSubset !== "object" || Array.isArray(record.frontmatterSubset)) {
      issues.push({ path: "frontmatterSubset", message: "frontmatterSubset must be an object when provided" })
    } else {
      const fm = record.frontmatterSubset as Record<string, unknown>
      const normalizedFm: FrontmatterSubset = {}
      for (const key of ["audience", "pain", "core_claim"] as const) {
        if (fm[key] !== undefined) {
          if (typeof fm[key] !== "string") {
            issues.push({ path: `frontmatterSubset.${key}`, message: `${key} must be a string when provided` })
          } else {
            normalizedFm[key] = fm[key] as string
          }
        }
      }
      if (fm.platforms !== undefined) {
        if (!Array.isArray(fm.platforms)) {
          issues.push({ path: "frontmatterSubset.platforms", message: "platforms must be an array when provided" })
        } else {
          const arr = fm.platforms as unknown[]
          const allStrings = arr.every((v) => typeof v === "string")
          if (!allStrings) {
            issues.push({ path: "frontmatterSubset.platforms", message: "platforms entries must be strings" })
          } else {
            normalizedFm.platforms = arr as string[]
          }
        }
      }
      frontmatterSubset = normalizedFm
    }
  }

  return {
    value: { title, frontmatterSubset, sourceUrl, dedupeKey },
    issues,
  }
}

function jsonError(status: number, body: object) {
  return NextResponse.json(body, { status })
}

/**
 * @description AFU 桥接入口：受信 AFU 服务把卡片摘要推入 Inspiration 表。
 *   仅允许来自 localhost 的请求，并校验 Bearer token 与 bridge 配置。
 */
export async function POST(request: NextRequest) {
  try {
    const bridgeToken = (env.AFU_BRIDGE_TOKEN ?? "").trim()
    const systemUserId = (env.AFU_BRIDGE_SYSTEM_USER_ID ?? "").trim()
    if (!bridgeToken || !systemUserId) {
      return jsonError(503, { ok: false, error: "bridge_not_configured" })
    }

    const authHeader = request.headers.get("authorization") ?? ""
    const [scheme, token] = authHeader.split(" ", 2) as [string?, string?]
    if (scheme?.toLowerCase() !== "bearer" || !token || token !== bridgeToken) {
      return jsonError(401, { ok: false, error: "unauthorized" })
    }

    const ct = request.headers.get("content-type") ?? ""
    if (!ct.toLowerCase().includes("application/json")) {
      return jsonError(400, { ok: false, error: "invalid_body", details: [{ path: "", message: "content-type must be application/json" }] })
    }

    const remoteIp = getRemoteIp(request)
    if (remoteIp === undefined) {
      // 本地端点安全前提：IP 必须可识别且为 127.0.0.1。
      // 部署侧需确保 HOSTNAME=127.0.0.1（env.ts 已暴露该字段）。
      return jsonError(403, { ok: false, error: "unidentified_source_ip" })
    } else if (!isAllowedIp(remoteIp)) {
      return jsonError(403, { ok: false, error: "invalid_source_ip" })
    }

    let raw: unknown
    try {
      raw = await parseJsonRecord(request, { maxBytes: MAX_BODY_BYTES })
    } catch (err) {
      const message = err instanceof Error ? err.message : "invalid JSON body"
      return jsonError(400, { ok: false, error: "invalid_body", details: [{ path: "", message }] })
    }
    const { value, issues } = validateBody(raw)
    if (issues.length > 0) {
      return jsonError(400, { ok: false, error: "invalid_body", details: issues })
    }

    const existing = await prisma.inspiration.findFirst({
      where: { dedupeKey: value.dedupeKey, userId: systemUserId },
      select: { id: true },
    })
    if (existing) {
      return jsonError(200, { ok: true, skipped: true, reason: "duplicate_dedupe_key" })
    }

    const content = buildContent(value.title, value.frontmatterSubset)
    const created = await prisma.inspiration.create({
      data: {
        userId: systemUserId,
        projectId: null,
        source: SOURCE_AFU_BRIDGE,
        content,
        dedupeKey: value.dedupeKey,
        sourceUrl: value.sourceUrl ?? null,
        aiStatus: "pending",
      },
      select: { id: true },
    })

    return NextResponse.json({ ok: true, created: true, id: created.id }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "internal error"
    return jsonError(500, { ok: false, error: "internal_error", details: [{ path: "", message }] })
  }
}
