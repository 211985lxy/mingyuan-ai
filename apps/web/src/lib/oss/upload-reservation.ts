/**
 * OSS 直传预约编排：签发 PostObject、完成校验、过期清理。
 */

import { createHash, randomBytes } from "node:crypto"
import OSS from "ali-oss"
import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import {
  POLICY_TTL_MS,
  UploadReservationError,
  assertDailyUploadQuota,
  assertPendingReservationLimit,
  assertUploadRateLimit,
  buildAssetUrl,
  buildOssPostPolicyDocument,
  buildUploadObjectKey,
  mapReservationAssetTypeToAsset,
  normalizeContentType,
  recordUploadGrant,
  validateUploadGrantInput,
} from "./upload-reservation-policy"

export {
  POLICY_TTL_MS,
  UPLOAD_SIZE_LIMITS,
  UploadReservationError,
  assertDailyUploadQuota,
  assertPendingReservationLimit,
  assertUploadRateLimit,
  buildOssPostPolicyDocument,
  buildUploadObjectKey,
  normalizeContentType,
  recordUploadGrant,
  resetUploadQuotaForTests,
  validateUploadGrantInput,
  type UploadAssetType,
} from "./upload-reservation-policy"

function isOssConfigured(): boolean {
  return !!(
    env.OSS_REGION &&
    env.OSS_ACCESS_KEY_ID &&
    env.OSS_ACCESS_KEY_SECRET &&
    env.OSS_BUCKET
  )
}

function getOssClient(): OSS {
  return new OSS({
    region: env.OSS_REGION!,
    accessKeyId: env.OSS_ACCESS_KEY_ID!,
    accessKeySecret: env.OSS_ACCESS_KEY_SECRET!,
    bucket: env.OSS_BUCKET!,
    secure: true,
    timeout: 60_000,
  })
}

function newUploadId(): string {
  return `up_${createHash("sha256").update(randomBytes(16)).digest("hex").slice(0, 24)}`
}

export type CreateUploadReservationResult = {
  uploadId: string
  method: "POST"
  uploadUrl: string
  fields: Record<string, string>
  assetUrl: string
  expiresAt: string
  maxBytes: number
}

async function requireOssConfigured(): Promise<void> {
  if (!isOssConfigured()) {
    throw new UploadReservationError("OSS storage is not configured", {
      status: 503,
      code: "OSS_NOT_CONFIGURED",
    })
  }
}

function signPostFields(input: {
  objectKey: string
  contentType: string
  sizeBytes: number
  expiresAt: Date
}): Record<string, string> {
  const client = getOssClient()
  const policyDoc = buildOssPostPolicyDocument(input)
  const signed = client.calculatePostSignature(policyDoc) as {
    OSSAccessKeyId: string
    Signature: string
    policy: string
  }
  return {
    key: input.objectKey,
    policy: signed.policy,
    OSSAccessKeyId: signed.OSSAccessKeyId,
    Signature: signed.Signature,
    "Content-Type": input.contentType,
    success_action_status: "200",
  }
}

/** 创建直传预约并签发 OSS PostObject 表单字段。 */
export async function createAssetUploadReservation(input: {
  userId: string
  fileName: string
  contentType: string
  sizeBytes: number
  assetType: string
}): Promise<CreateUploadReservationResult> {
  await requireOssConfigured()
  const validated = validateUploadGrantInput(input)
  assertUploadRateLimit(input.userId)
  await assertPendingReservationLimit(input.userId)
  await assertDailyUploadQuota(input.userId, validated.sizeBytes)

  const uploadId = newUploadId()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + POLICY_TTL_MS)
  const objectKey = buildUploadObjectKey({
    userId: input.userId,
    uploadId,
    fileName: input.fileName,
    now,
  })
  const assetUrl = buildAssetUrl(objectKey)
  const fields = signPostFields({
    objectKey,
    contentType: validated.contentType,
    sizeBytes: validated.sizeBytes,
    expiresAt,
  })

  await prisma.assetUploadReservation.create({
    data: {
      id: uploadId,
      userId: input.userId,
      objectKey,
      declaredSizeBytes: validated.sizeBytes,
      contentType: validated.contentType,
      assetType: validated.assetType,
      status: "pending",
      assetUrl,
      expiresAt,
    },
  })
  recordUploadGrant(input.userId, validated.sizeBytes)

  return {
    uploadId,
    method: "POST",
    uploadUrl: `https://${env.OSS_BUCKET}.${env.OSS_REGION}.aliyuncs.com`,
    fields,
    assetUrl,
    expiresAt: expiresAt.toISOString(),
    maxBytes: validated.sizeBytes,
  }
}

export type ManagedObjectMeta = {
  sizeBytes: number
  contentType: string | null
}

/** HEAD/getObjectMeta：校验已上传对象的大小与 Content-Type */
export async function headManagedObject(objectKey: string): Promise<ManagedObjectMeta> {
  await requireOssConfigured()
  const client = getOssClient() as OSS & {
    getObjectMeta?: (name: string) => Promise<{
      res?: { headers?: Record<string, string> }
      headers?: Record<string, string>
    }>
  }
  const result = (await (client.getObjectMeta
    ? client.getObjectMeta(objectKey)
    : client.head(objectKey))) as {
    res?: { headers?: Record<string, string> }
    headers?: Record<string, string>
  }
  const headers = result.res?.headers ?? result.headers ?? {}
  const sizeBytes = Number(headers["content-length"] ?? headers["Content-Length"])
  if (!Number.isFinite(sizeBytes)) {
    throw new UploadReservationError("无法读取 OSS 对象大小", {
      status: 502,
      code: "OSS_HEAD_FAILED",
    })
  }
  const rawType = headers["content-type"] ?? headers["Content-Type"] ?? null
  return {
    sizeBytes,
    contentType: rawType ? normalizeContentType(rawType) : null,
  }
}

async function loadCompletableReservation(uploadId: string, userId: string) {
  const reservation = await prisma.assetUploadReservation.findUnique({
    where: { id: uploadId },
  })
  if (!reservation || reservation.userId !== userId) {
    throw new UploadReservationError("上传预约不存在", {
      status: 404,
      code: "UPLOAD_NOT_FOUND",
    })
  }
  if (reservation.status === "completed") {
    throw new UploadReservationError("上传预约已完成", {
      status: 409,
      code: "UPLOAD_ALREADY_COMPLETED",
    })
  }
  if (reservation.status !== "pending") {
    throw new UploadReservationError(`上传预约状态不可用: ${reservation.status}`, {
      status: 409,
      code: "UPLOAD_BAD_STATUS",
    })
  }
  if (reservation.expiresAt.getTime() < Date.now()) {
    await prisma.assetUploadReservation.update({
      where: { id: reservation.id },
      data: { status: "expired" },
    })
    throw new UploadReservationError("上传预约已过期", {
      status: 410,
      code: "UPLOAD_EXPIRED",
    })
  }
  return reservation
}

function assertObjectMatchesReservation(
  reservation: { declaredSizeBytes: number; contentType: string },
  meta: ManagedObjectMeta,
): void {
  if (meta.sizeBytes !== reservation.declaredSizeBytes) {
    throw new UploadReservationError(
      `上传大小与预约不符：期望 ${reservation.declaredSizeBytes} 字节，实际 ${meta.sizeBytes}`,
      { status: 422, code: "UPLOAD_SIZE_MISMATCH" },
    )
  }
  if (
    meta.contentType &&
    normalizeContentType(meta.contentType) !==
      normalizeContentType(reservation.contentType)
  ) {
    throw new UploadReservationError(
      `Content-Type 与预约不符：期望 ${reservation.contentType}，实际 ${meta.contentType}`,
      { status: 422, code: "UPLOAD_CONTENT_TYPE_MISMATCH" },
    )
  }
}

export async function completeAssetUploadReservation(input: {
  uploadId: string
  userId: string
  name?: string
}): Promise<{
  id: string
  userId: string
  name: string
  assetType: string
  url: string
  size: number | null
}> {
  const reservation = await loadCompletableReservation(input.uploadId, input.userId)
  const meta = await headManagedObject(reservation.objectKey)
  assertObjectMatchesReservation(reservation, meta)

  const assetName =
    input.name?.trim() ||
    reservation.objectKey.split("/").pop()?.replace(/\.[^.]+$/, "") ||
    "asset"

  const asset = await prisma.asset.create({
    data: {
      userId: input.userId,
      name: assetName,
      assetType: mapReservationAssetTypeToAsset(reservation.assetType),
      url: reservation.assetUrl,
      size: reservation.declaredSizeBytes,
    },
  })
  await prisma.assetUploadReservation.update({
    where: { id: reservation.id },
    data: { status: "completed", completedAt: new Date() },
  })
  return asset
}

/** 清理过期 pending 预约；可选删除 OSS 孤儿对象。 */
export async function cleanupExpiredUploadReservations(options?: {
  deleteOrphans?: boolean
  limit?: number
}): Promise<{ expired: number; deletedObjects: number }> {
  const now = new Date()
  const limit = options?.limit ?? 100
  const expiredRows = await prisma.assetUploadReservation.findMany({
    where: { status: "pending", expiresAt: { lt: now } },
    take: limit,
    select: { id: true, objectKey: true },
  })
  if (expiredRows.length === 0) return { expired: 0, deletedObjects: 0 }

  await prisma.assetUploadReservation.updateMany({
    where: { id: { in: expiredRows.map((r) => r.id) } },
    data: { status: "expired" },
  })

  let deletedObjects = 0
  if (options?.deleteOrphans && isOssConfigured()) {
    const client = getOssClient()
    for (const row of expiredRows) {
      try {
        await client.delete(row.objectKey)
        deletedObjects += 1
      } catch {
        // 对象可能不存在
      }
    }
  }
  return { expired: expiredRows.length, deletedObjects }
}

/** 供 POST /api/assets 校验：托管桶 URL 必须对应已完成预约 */
export async function assertCompletedReservationForManagedUrl(input: {
  userId: string
  assetUrl: string
  uploadId?: string | null
}): Promise<void> {
  if (!input.uploadId) {
    throw new UploadReservationError(
      "托管存储资源必须通过上传完成接口登记，请提供 uploadId",
      { status: 400, code: "UPLOAD_ID_REQUIRED" },
    )
  }
  const reservation = await prisma.assetUploadReservation.findUnique({
    where: { id: input.uploadId },
  })
  if (
    !reservation ||
    reservation.userId !== input.userId ||
    reservation.assetUrl !== input.assetUrl ||
    reservation.status !== "completed"
  ) {
    throw new UploadReservationError("uploadId 与资源 URL 不匹配或未完成", {
      status: 400,
      code: "UPLOAD_RESERVATION_INVALID",
    })
  }
}
