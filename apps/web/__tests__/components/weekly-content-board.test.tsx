import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { WeeklyContentBoard } from "@/features/aim/components/weekly-content-board"

describe("WeeklyContentBoard", () => {
  it("shows one primary action per topic and opens the existing AIM deep link", async () => {
    const onOpen = vi.fn()
    render(<WeeklyContentBoard projectId="project-1" items={[{
      key: "topic-1:0", topicSelectionId: "topic-1", candidateIndex: 0,
      title: "Founder story", sourceSummary: "Interview", generationId: null,
      workflowStatus: null, stage: "direction", nextAction: "start_writing",
    }]} onOpen={onOpen} />)
    expect(screen.getByText("Founder story")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "开始创作" }))
    expect(onOpen).toHaveBeenCalledWith(expect.stringContaining("topicSelectionId=topic-1"))
  })
})
