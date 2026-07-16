import { prisma } from "./prisma"
import type { SeasonalEvent } from "@/types/content-template"

/**
 * Find published templates whose hotTopicKeywords match the given topic word.
 */
export async function matchTemplatesForHotTopic(
  topicWord: string
): Promise<{ id: string; name: string }[]> {
  const published = await prisma.contentTemplate.findMany({
    where: { status: "published" },
    select: { id: true, displayName: true, hotTopicKeywords: true },
    take: 500,
  })

  return published
    .filter((t) => {
      const keywords = Array.isArray(t.hotTopicKeywords)
        ? (t.hotTopicKeywords as unknown as string[])
        : []
      if (keywords.length === 0) return false
      return keywords.some((kw) => topicWord.includes(kw) || kw.includes(topicWord))
    })
    .slice(0, 3)
    .map((t) => ({ id: t.id, name: t.displayName }))
}

/**
 * Find published templates whose seasonalEvents include the current date.
 */
export async function matchSeasonalTemplates(): Promise<
  { id: string; name: string }[]
> {
  const now = new Date()
  const currentMMDD = `${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

  const published = await prisma.contentTemplate.findMany({
    where: { status: "published" },
    select: { id: true, displayName: true, seasonalEvents: true },
    take: 500,
  })

  return published
    .filter((t) => {
      const events = Array.isArray(t.seasonalEvents)
        ? (t.seasonalEvents as unknown as SeasonalEvent[])
        : []
      if (events.length === 0) return false
      return events.some((e) => currentMMDD >= e.startDate && currentMMDD <= e.endDate)
    })
    .map((t) => ({ id: t.id, name: t.displayName }))
}
