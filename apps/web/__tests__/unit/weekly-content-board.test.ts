import { describe, expect, it } from "vitest"

import { buildWeeklyContentBoard } from "@/lib/aim/weekly-content-board"

describe("weekly content board projection", () => {
  it("uses topic selection and candidate index as the stable key", () => {
    const board = buildWeeklyContentBoard({
      selections: [{
        id: "topic-1",
        candidates: [{ title: "First topic" }, { title: "Second topic" }],
        sourceHighlights: [{ title: "Customer interview", content: "Pain point" }],
        createdAt: new Date("2026-08-12T00:00:00Z"),
      }],
      generations: [{
        id: "generation-1",
        topicSelectionId: "topic-1",
        selectedTopicIndex: 1,
        workflowStatus: "pending_review",
        updatedAt: new Date("2026-08-12T01:00:00Z"),
      }],
    })
    expect(board.map((item) => item.key)).toEqual(["topic-1:0", "topic-1:1"])
    expect(board[1]).toMatchObject({
      generationId: "generation-1",
      stage: "publish",
      nextAction: "review_publish",
    })
  })

  it("derives states from existing workflowStatus only", () => {
    const statuses = ["draft", "pending_review", "ready_to_publish", "published", "results"]
    const items = buildWeeklyContentBoard({
      selections: [{ id: "topic-1", candidates: statuses.map((status) => ({ title: status })), sourceHighlights: [], createdAt: new Date() }],
      generations: statuses.map((workflowStatus, selectedTopicIndex) => ({ id: `g-${selectedTopicIndex}`, topicSelectionId: "topic-1", selectedTopicIndex, workflowStatus, updatedAt: new Date() })),
    })
    expect(items.map((item) => item.stage)).toEqual(["content", "publish", "publish", "results", "results"])
  })
})
