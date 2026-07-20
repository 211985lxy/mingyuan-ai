import { prisma } from "@/lib/prisma"
import type { TopicContext } from "@/lib/script-generator"

interface OpeningTypeRecord {
  code: string
  name: string
  formulas: unknown
}

interface CopyStructureRecord {
  code: string
  name: string
  beats: unknown
}

interface EndingTypeRecord {
  code: string
  name: string
  guidance: string
  patterns: unknown
}

interface CopyBeat {
  label: string
  instruction: string
}

/**
 * @description 构建topiccontext
 * @param topicSelectionId - 主题Selection唯一标识符
 * @param openingTypeCode - opening类型代码
 * @param copyStructureCode - copyStructure代码
 * @param endingTypeCode - ending类型代码
 * @param userId - 用户 ID
 * @returns Promise<TopicContext>
 */
export async function buildTopicContext(
  topicSelectionId: string,
  openingTypeCode: string,
  copyStructureCode: string,
  endingTypeCode: string,
  userId: string,
): Promise<TopicContext> {
  const [topicSelection, openingType, copyStructure, endingType] = await Promise.all([
    prisma.topicSelection.findUnique({
      where: { id: topicSelectionId, userId },
    }),
    prisma.openingType.findUnique({
      where: { code: openingTypeCode, status: "published" },
      select: { code: true, name: true, formulas: true },
    }) as Promise<OpeningTypeRecord | null>,
    prisma.copyStructure.findUnique({
      where: { code: copyStructureCode, status: "published" },
      select: { code: true, name: true, beats: true },
    }) as Promise<CopyStructureRecord | null>,
    prisma.endingType.findUnique({
      where: { code: endingTypeCode, status: "published" },
      select: { code: true, name: true, guidance: true, patterns: true },
    }) as Promise<EndingTypeRecord | null>,
  ])

  if (!topicSelection) {
    throw new Error(`TopicSelection not found: ${topicSelectionId}`)
  }
  if (!openingType) {
    throw new Error(`OpeningType not found: ${openingTypeCode}`)
  }
  if (!copyStructure) {
    throw new Error(`CopyStructure not found: ${copyStructureCode}`)
  }
  if (!endingType) {
    throw new Error(`EndingType not found: ${endingTypeCode}`)
  }

  const candidates = topicSelection.candidates as unknown as Array<{
    title?: string
    elementCodes?: string[]
  }>
  const selectedIndex = topicSelection.selectedIndex ?? 0
  const selectedCard = candidates[selectedIndex] ?? candidates[0]
  const topicTitle = selectedCard?.title ?? "未命名选题"
  const elementTags = Array.isArray(topicSelection.elementCodes)
    ? (topicSelection.elementCodes as string[])
    : (selectedCard?.elementCodes ?? [])

  const formulas = Array.isArray(openingType.formulas)
    ? (openingType.formulas as string[])
    : []
  const beats = Array.isArray(copyStructure.beats)
    ? (copyStructure.beats as CopyBeat[])
    : []
  const patterns = Array.isArray(endingType.patterns)
    ? (endingType.patterns as string[])
    : []

  return {
    topicSelectionId,
    topicTitle,
    elementTags,
    openingTypeCode: openingType.code,
    openingTypeName: openingType.name,
    openingFormulas: formulas,
    copyStructureCode: copyStructure.code,
    copyStructureName: copyStructure.name,
    copyStructureBeats: beats,
    endingTypeCode: endingType.code,
    endingTypeName: endingType.name,
    endingGuidance: endingType.guidance,
    endingPatterns: patterns,
  }
}
