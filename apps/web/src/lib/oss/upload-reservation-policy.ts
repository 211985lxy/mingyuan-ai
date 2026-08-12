/**
 * OSS 直传预约：校验、配额与 Policy 文档。
 * 多实例部署时进程内限流需换成共享计数。
 */

import { env } from "@/env"
import { prisma } from "@/lib/prisma"

export const POLICY_TTL_MS = 5 * 60 * 1000

export const UPLOAD_SIZE_LIMITS = {
  image: 8 * 1024 * 1024,
  document: 10 * 1024 * 1024,
  audio: 200 * 1024 * 1024,
  video: 200 * 1024 * 1024,
} as const

export type UploadAssetType = keyof typeof UPLOAD_SIZE_LIMITS

export const CONTENT_TYPE_WHITELIST: Record<UploadAssetType, ReadonlySet<string>> = {
  image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  document: new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/markdown",
    "text/csv",
  ]),
  audio: new Set([
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
  ]),
  video: new Set(["video/mp4", "video/quicktime", "video/webm"]),
}

const DAILY_MAX_OBJECTS = 100
const DAILY_MAX_BYTES = 1024 * 1024 * 1024
const GRANTS_PER_MINUTE = 10
export const MAX_PENDING = 3

type GrantBucket = {
  windowStart: number
  count: number
  dayKey: string
  dayBytes: number
  dayCount: number
}

const grantBuckets = new Map<string, GrantBucket>()

export class UploadReservationError extends Error {
  status: number
  code: string

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message)
    this.name = "UploadReservationError"
    this.status = options?.status ?? 400
    this.code = options?.code ?? "UPLOAD_RESERVATION_ERROR"
  }
}

export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

export function normalizeContentType(contentType: string): string {
  return contentType.split(";")[0]?.trim().toLowerCase() || ""
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".")
  if (dot < 0) return ""
  return fileName.slice(dot).toLowerCase()
}

export function resetUploadQuotaForTests(): void {
  grantBuckets.clear()
}

export function validateUploadGrantInput(input: {
  fileName: string
  contentType: string
  sizeBytes: number
  assetType: string
}): { assetType: UploadAssetType; contentType: string; sizeBytes: number } {
  const assetType = input.assetType as UploadAssetType
  if (!(assetType in UPLOAD_SIZE_LIMITS)) {
    throw new UploadReservationError(
      `assetType 必须是: ${Object.keys(UPLOAD_SIZE_LIMITS).join(", ")}`,
      { code: "UPLOAD_INVALID_ASSET_TYPE" },
    )
  }
  const sizeBytes = Number(input.sizeBytes)
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new UploadReservationError("sizeBytes 必须是正整数", {
      code: "UPLOAD_INVALID_SIZE",
    })
  }
  const max = UPLOAD_SIZE_LIMITS[assetType]
  if (sizeBytes > max) {
    throw new UploadReservationError(
      `${assetType} 文件过大：上限 ${(max / (1024 * 1024)).toFixed(0)}MiB`,
      { code: "UPLOAD_SIZE_EXCEEDED", status: 413 },
    )
  }
  const contentType = normalizeContentType(input.contentType)
  if (!CONTENT_TYPE_WHITELIST[assetType].has(contentType)) {
    throw new UploadReservationError(
      `不允许的 Content-Type「${contentType}」用于 ${assetType}`,
      { code: "UPLOAD_CONTENT_TYPE_DENIED" },
    )
  }
  if (!input.fileName?.trim()) {
    throw new UploadReservationError("fileName 必填", { code: "UPLOAD_FILENAME_REQUIRED" })
  }
  return { assetType, contentType, sizeBytes }
}

export function buildUploadObjectKey(input: {
  userId: string
  uploadId: string
  fileName: string
  now?: Date
}): string {
  const now = input.now ?? new Date()
  const ymd = now.toISOString().slice(0, 10)
  const ext = extensionOf(input.fileName) || ""
  return `uploads/${input.userId}/${ymd}/${input.uploadId}${ext}`
}

export function buildOssPostPolicyDocument(input: {
  objectKey: string
  contentType: string
  sizeBytes: number
  expiresAt: Date
  bucket?: string
}): { expiration: string; conditions: unknown[] } {
  const bucket = input.bucket ?? env.OSS_BUCKET!
  return {
    expiration: input.expiresAt.toISOString(),
    conditions: [
      { bucket },
      ["eq", "$key", input.objectKey],
      ["eq", "$Content-Type", input.contentType],
      ["content-length-range", input.sizeBytes, input.sizeBytes],
      ["eq", "$success_action_status", "200"],
    ],
  }
}

function getOrCreateBucket(userId: string, now = Date.now()): GrantBucket {
  const existing = grantBuckets.get(userId)
  const key = dayKey(new Date(now))
  if (!existing) {
    const created: GrantBucket = {
      windowStart: now,
      count: 0,
      dayKey: key,
      dayBytes: 0,
      dayCount: 0,
    }
    grantBuckets.set(userId, created)
    return created
  }
  if (now - existing.windowStart >= 60_000) {
    existing.windowStart = now
    existing.count = 0
  }
  if (existing.dayKey !== key) {
    existing.dayKey = key
    existing.dayBytes = 0
    existing.dayCount = 0
  }
  return existing
}

export function assertUploadRateLimit(userId: string, now = Date.now()): void {
  const bucket = getOrCreateBucket(userId, now)
  if (bucket.count >= GRANTS_PER_MINUTE) {
    throw new UploadReservationError("上传过于频繁，请稍后再试（每分钟最多 10 次授权）", {
      status: 429,
      code: "UPLOAD_RATE_LIMITED",
    })
  }
}

export function recordUploadGrant(userId: string, sizeBytes: number, now = Date.now()): void {
  const bucket = getOrCreateBucket(userId, now)
  bucket.count += 1
  bucket.dayCount += 1
  bucket.dayBytes += sizeBytes
}

export async function assertPendingReservationLimit(userId: string): Promise<void> {
  const pending = await prisma.assetUploadReservation.count({
    where: { userId, status: "pending", expiresAt: { gt: new Date() } },
  })
  if (pending >= MAX_PENDING) {
    throw new UploadReservationError(`待完成上传预约过多（最多 ${MAX_PENDING} 个）`, {
      status: 429,
      code: "UPLOAD_PENDING_LIMIT",
    })
  }
}

export async function assertDailyUploadQuota(
  userId: string,
  incomingBytes: number,
): Promise<void> {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const agg = await prisma.assetUploadReservation.aggregate({
    where: {
      userId,
      createdAt: { gte: start },
      status: { in: ["pending", "completed"] },
    },
    _sum: { declaredSizeBytes: true },
    _count: true,
  })
  const count =
    typeof agg._count === "number"
      ? agg._count
      : Number((agg._count as { _all?: number })?._all ?? 0)
  const usedBytes = agg._sum.declaredSizeBytes ?? 0
  const mem = getOrCreateBucket(userId)
  if (Math.max(count, mem.dayCount) >= DAILY_MAX_OBJECTS) {
    throw new UploadReservationError(`今日上传对象数已达上限（${DAILY_MAX_OBJECTS}）`, {
      status: 429,
      code: "UPLOAD_DAILY_COUNT_LIMIT",
    })
  }
  if (Math.max(usedBytes, mem.dayBytes) + incomingBytes > DAILY_MAX_BYTES) {
    throw new UploadReservationError("今日上传声明体积已达 1GiB 上限", {
      status: 429,
      code: "UPLOAD_DAILY_BYTES_LIMIT",
    })
  }
}

export function buildAssetUrl(objectKey: string): string {
  const encodedPath = objectKey
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/")
  return `https://${env.OSS_BUCKET}.${env.OSS_REGION}.aliyuncs.com/${encodedPath}`
}

export function mapReservationAssetTypeToAsset(assetType: string): string {
  if (assetType === "audio") return "music"
  if (assetType === "document") return "document"
  return assetType
}
