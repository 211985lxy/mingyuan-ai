import { createHash } from "crypto"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { generateSignedUrl, isManagedOssUrl, transferFromUrl } from "@/lib/oss"
import { ShanjianError, generateRawVideo, getTaskInfo } from "@/lib/shanjian"

type PreviewRecord = Awaited<ReturnType<typeof prisma.publicAvatarPreviewCache.findUnique>>

export interface PublicAvatarPreviewPayload {
  taskId: string
  status: "processing" | "succeed" | "failed"
  videoUrl: string | null
  coverUrl: string | null
  duration: number | null
  errorCode: string | null
  errorMessage: string | null
  speakerId: string
  text: string
  cached: boolean
}

export interface PublicAvatarPreviewDefaultsPayload {
  text: string | null
  speakerId: string | null
  preview: PublicAvatarPreviewPayload | null
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ")
}

function buildCacheKey(virtualmanId: string, speakerId: string, text: string): string {
  return createHash("sha1")
    .update(`public-avatar-preview:v1:${virtualmanId}:${speakerId}:${text}`)
    .digest("hex")
}

function buildTextHash(text: string): string {
  return createHash("sha1")
    .update(text)
    .digest("hex")
}

function mapRecord(record: NonNullable<PreviewRecord>): PublicAvatarPreviewPayload {
  return {
    taskId: record.id,
    status:
      record.status === "completed"
        ? "succeed"
        : record.status === "failed"
          ? "failed"
          : "processing",
    videoUrl: record.videoUrl ? generateSignedUrl(record.videoUrl) : null,
    coverUrl: record.coverUrl ? generateSignedUrl(record.coverUrl) : null,
    duration: record.duration ?? null,
    errorCode: record.errorCode ?? null,
    errorMessage: record.errorMessage ?? null,
    speakerId: record.speakerId,
    text: record.text,
    cached: record.status === "completed" && !!record.videoUrl && isManagedOssUrl(record.videoUrl),
  }
}

async function findSharedDefaultPreview(
  virtualmanId: string
): Promise<NonNullable<PreviewRecord> | null> {
  return prisma.publicAvatarPreviewCache.findFirst({
    where: {
      virtualmanId,
      status: "completed",
      videoUrl: {
        not: null,
      },
    },
    orderBy: [
      { lastAccessedAt: "desc" },
      { updatedAt: "desc" },
    ],
  })
}

async function touchRecord(id: string): Promise<void> {
  await prisma.publicAvatarPreviewCache.update({
    where: { id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {})
}

async function savePreference(input: {
  userId: string
  virtualmanId: string
  speakerId: string
  text: string
  previewCacheId: string
}): Promise<void> {
  await prisma.publicAvatarPreviewPreference.upsert({
    where: {
      userId_virtualmanId: {
        userId: input.userId,
        virtualmanId: input.virtualmanId,
      },
    },
    create: input,
    update: {
      speakerId: input.speakerId,
      text: input.text,
      previewCacheId: input.previewCacheId,
    },
  })
}

async function syncRecord(record: NonNullable<PreviewRecord>): Promise<PublicAvatarPreviewPayload> {
  if (record.status === "completed" || record.status === "failed" || !record.externalTaskId) {
    await touchRecord(record.id)
    return mapRecord(record)
  }

  const task = await getTaskInfo(record.externalTaskId)

  if (task.status === "processing") {
    await touchRecord(record.id)
    return mapRecord(record)
  }

  if (task.status === "failed") {
    const updated = await prisma.publicAvatarPreviewCache.update({
      where: { id: record.id },
      data: {
        status: "failed",
        errorCode: task.errorCode ?? null,
        errorMessage: task.errorMessage ?? null,
        lastAccessedAt: new Date(),
      },
    })
    return mapRecord(updated)
  }

  if (!task.result?.videoUrl) {
    const updated = await prisma.publicAvatarPreviewCache.update({
      where: { id: record.id },
      data: {
        status: "failed",
        errorCode: "PREVIEW_VIDEO_MISSING",
        errorMessage: "试看视频生成成功但未返回视频地址",
        lastAccessedAt: new Date(),
      },
    })
    return mapRecord(updated)
  }

  const ossVideoUrl = await transferFromUrl(
    task.result.videoUrl,
    `preview-cache/${record.id}/video.mp4`
  )
  const ossCoverUrl = task.result.coverUrl
    ? await transferFromUrl(
        task.result.coverUrl,
        `preview-cache/${record.id}/cover.jpg`
      )
    : null

  const updated = await prisma.publicAvatarPreviewCache.update({
    where: { id: record.id },
    data: {
      status: "completed",
      videoUrl: ossVideoUrl ?? null,
      coverUrl: ossCoverUrl ?? null,
      duration: task.result.duration ?? null,
      errorCode: null,
      errorMessage: null,
      lastAccessedAt: new Date(),
    },
  })

  return mapRecord(updated)
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError
    && error.code === "P2002"
  )
}

export async function createOrReusePublicAvatarPreview(input: {
  userId: string
  virtualmanId: string
  speakerId: string
  text: string
}): Promise<PublicAvatarPreviewPayload> {
  const normalizedText = normalizeText(input.text)
  const cacheKey = buildCacheKey(input.virtualmanId, input.speakerId, normalizedText)
  const textHash = buildTextHash(normalizedText)

  let record = await prisma.publicAvatarPreviewCache.findUnique({
    where: { cacheKey },
  })

  if (record && record.status !== "failed") {
    await savePreference({
      userId: input.userId,
      virtualmanId: input.virtualmanId,
      speakerId: input.speakerId,
      text: normalizedText,
      previewCacheId: record.id,
    })
    await touchRecord(record.id)
    return mapRecord(record)
  }

  if (!record) {
    try {
      record = await prisma.publicAvatarPreviewCache.create({
        data: {
          cacheKey,
          virtualmanId: input.virtualmanId,
          speakerId: input.speakerId,
          text: normalizedText,
          textHash,
          status: "processing",
        },
      })
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error
      record = await prisma.publicAvatarPreviewCache.findUnique({
        where: { cacheKey },
      })
      if (record) {
        await savePreference({
          userId: input.userId,
          virtualmanId: input.virtualmanId,
          speakerId: input.speakerId,
          text: normalizedText,
          previewCacheId: record.id,
        })
        await touchRecord(record.id)
        return mapRecord(record)
      }
      throw error
    }
  } else {
    record = await prisma.publicAvatarPreviewCache.update({
      where: { id: record.id },
      data: {
        speakerId: input.speakerId,
        text: normalizedText,
        textHash,
        status: "processing",
        externalTaskId: null,
        videoUrl: null,
        coverUrl: null,
        duration: null,
        errorCode: null,
        errorMessage: null,
        lastAccessedAt: new Date(),
      },
    })
  }

  await savePreference({
    userId: input.userId,
    virtualmanId: input.virtualmanId,
    speakerId: input.speakerId,
    text: normalizedText,
    previewCacheId: record.id,
  })

  if (record.externalTaskId) {
    await touchRecord(record.id)
    return mapRecord(record)
  }

  try {
    const { taskId: externalTaskId } = await generateRawVideo(
      {
        virtualmanId: input.virtualmanId,
        speakerId: input.speakerId,
        text: normalizedText,
        metadata: {
          preview: `public-avatar:${textHash.slice(0, 12)}`,
        },
      },
      { withCallback: false }
    )

    const updated = await prisma.publicAvatarPreviewCache.update({
      where: { id: record.id },
      data: {
        externalTaskId,
        lastAccessedAt: new Date(),
      },
    })

    return mapRecord(updated)
  } catch (error) {
    const updated = await prisma.publicAvatarPreviewCache.update({
      where: { id: record.id },
      data: {
        status: "failed",
        errorCode: error instanceof ShanjianError ? error.code : "PREVIEW_SUBMIT_FAILED",
        errorMessage: error instanceof Error ? error.message : "试看生成失败，请稍后重试",
        lastAccessedAt: new Date(),
      },
    })
    return mapRecord(updated)
  }
}

export async function getPublicAvatarPreviewById(
  previewId: string
): Promise<PublicAvatarPreviewPayload | null> {
  const record = await prisma.publicAvatarPreviewCache.findUnique({
    where: { id: previewId },
  })
  if (!record) return null
  return syncRecord(record)
}

export async function getPublicAvatarPreviewDefaults(input: {
  userId: string
  virtualmanId: string
}): Promise<PublicAvatarPreviewDefaultsPayload> {
  const preference = await prisma.publicAvatarPreviewPreference.findUnique({
    where: {
      userId_virtualmanId: {
        userId: input.userId,
        virtualmanId: input.virtualmanId,
      },
    },
    include: {
      previewCache: true,
    },
  })

  if (!preference) {
    const sharedPreview = await findSharedDefaultPreview(input.virtualmanId)
    return {
      text: sharedPreview?.text ?? null,
      speakerId: sharedPreview?.speakerId ?? null,
      preview: sharedPreview ? mapRecord(sharedPreview) : null,
    }
  }

  return {
    text: preference.text,
    speakerId: preference.speakerId,
    preview: preference.previewCache
      ? mapRecord(preference.previewCache)
      : null,
  }
}
