import type { AimWorkflowStage } from "@/lib/aim-workflow"

interface TopicSelectionRow {
  id: string
  candidates: unknown
  sourceHighlights: unknown
  createdAt: Date
}

interface GenerationRow {
  id: string
  topicSelectionId: string | null
  selectedTopicIndex: number | null
  workflowStatus: string
  updatedAt: Date
}

export interface WeeklyContentBoardItem {
  key: string
  topicSelectionId: string
  candidateIndex: number
  title: string
  sourceSummary: string | null
  generationId: string | null
  workflowStatus: string | null
  stage: AimWorkflowStage
  nextAction: "start_writing" | "continue_editing" | "review_publish" | "fill_results"
}

function candidateTitle(candidate: unknown, index: number): string {
  if (candidate && typeof candidate === "object" && typeof (candidate as { title?: unknown }).title === "string") {
    return (candidate as { title: string }).title
  }
  return `选题 ${index + 1}`
}

function sourceSummary(sourceHighlights: unknown): string | null {
  if (!Array.isArray(sourceHighlights)) return null
  return sourceHighlights.slice(0, 2).map((source) => {
    if (!source || typeof source !== "object") return ""
    const item = source as { title?: unknown; content?: unknown }
    return [item.title, item.content].filter((value): value is string => typeof value === "string" && Boolean(value.trim())).join("：")
  }).filter(Boolean).join("｜") || null
}

function workflowProjection(status: string | null): Pick<WeeklyContentBoardItem, "stage" | "nextAction"> {
  if (!status) return { stage: "direction", nextAction: "start_writing" }
  if (status === "draft") return { stage: "content", nextAction: "continue_editing" }
  if (status === "pending_review" || status === "ready_to_publish") return { stage: "publish", nextAction: "review_publish" }
  return { stage: "results", nextAction: "fill_results" }
}

export function buildWeeklyContentBoard(input: {
  selections: TopicSelectionRow[]
  generations: GenerationRow[]
}): WeeklyContentBoardItem[] {
  const generationByKey = new Map<string, GenerationRow>()
  for (const generation of input.generations) {
    if (!generation.topicSelectionId || generation.selectedTopicIndex == null) continue
    const key = `${generation.topicSelectionId}:${generation.selectedTopicIndex}`
    const current = generationByKey.get(key)
    if (!current || current.updatedAt < generation.updatedAt) generationByKey.set(key, generation)
  }
  return input.selections.flatMap((selection) => {
    const candidates = Array.isArray(selection.candidates) ? selection.candidates : []
    return candidates.map((candidate, candidateIndex) => {
      const key = `${selection.id}:${candidateIndex}`
      const generation = generationByKey.get(key) ?? null
      return {
        key,
        topicSelectionId: selection.id,
        candidateIndex,
        title: candidateTitle(candidate, candidateIndex),
        sourceSummary: sourceSummary(selection.sourceHighlights),
        generationId: generation?.id ?? null,
        workflowStatus: generation?.workflowStatus ?? null,
        ...workflowProjection(generation?.workflowStatus ?? null),
      }
    })
  })
}
