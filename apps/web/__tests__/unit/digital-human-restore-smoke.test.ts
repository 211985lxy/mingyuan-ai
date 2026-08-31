import { describe, expect, it } from "vitest"
import { ACTIVE_VIDEO_TASK_STATUSES, isActiveVideoTaskStatus } from "@/lib/video-task-domain"
import { VALID_VIDEO_TASK_TYPES } from "@/lib/video-task-request/contracts"
import { PLAN_CONCURRENCY_LIMITS } from "@/types/content-template"
import { AIM_AGENT_GUIDES } from "@/lib/aim-agent-guides"

describe("digital-human restore smoke", () => {
  it("exposes virtualman broadcast as a valid video task type", () => {
    expect(VALID_VIDEO_TASK_TYPES).toContain("virtualman_broadcast")
  })

  it("keeps pending/processing as active task statuses", () => {
    expect(ACTIVE_VIDEO_TASK_STATUSES).toEqual(expect.arrayContaining(["pending", "processing"]))
    expect(isActiveVideoTaskStatus("processing")).toBe(true)
    expect(isActiveVideoTaskStatus("completed")).toBe(false)
  })

  it("defines plan concurrency limits for video generation", () => {
    expect(PLAN_CONCURRENCY_LIMITS.free).toBeGreaterThan(0)
    expect(PLAN_CONCURRENCY_LIMITS.pro).toBeGreaterThanOrEqual(PLAN_CONCURRENCY_LIMITS.free)
  })

  it("wires digital-human next action on work_editor and content_producer", () => {
    const work = AIM_AGENT_GUIDES.work_editor.nextActions.find(
      (action) => action.id === "generate_digital_human_video",
    )
    const producer = AIM_AGENT_GUIDES.content_producer.nextActions.find(
      (action) => action.id === "generate_digital_human_video",
    )
    expect(work?.workbenchAction).toBe("generate_digital_human_video")
    expect(producer?.workbenchAction).toBe("generate_digital_human_video")
  })
})
