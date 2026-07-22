import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/competitor-analysis/background-task", () => ({
  COMPETITOR_ANALYSIS_TASK_KIND: "competitor_analysis",
  executeCompetitorAnalysisBackgroundTask: vi.fn(),
}))
vi.mock("@/features/topics/services/inspiration-background-task", () => ({
  INSPIRATION_PROCESS_TASK_KIND: "inspiration_process",
  executeInspirationBackgroundTask: vi.fn(),
}))
vi.mock("@/features/topics/services/inspiration-events", () => ({
  INSPIRATION_PIPELINE_TASK_KIND: "inspiration_pipeline",
}))
vi.mock("@/features/topics/services/inspiration-pipeline-background-task", () => ({
  executeInspirationPipelineBackgroundTask: vi.fn(),
}))
vi.mock("@/features/topics/services/reply-outbox", () => ({
  OUTBOX_SEND_TASK_KIND: "inspiration_outbox_send",
}))
vi.mock("@/features/topics/services/reply-outbox-background-task", () => ({
  executeOutboxSendBackgroundTask: vi.fn(),
}))
vi.mock("@/features/aim-channels/aim-channel-generate-task", () => ({
  AIM_CHANNEL_GENERATE_TASK_KIND: "aim_channel_generate",
  executeAimChannelGenerateBackgroundTask: vi.fn(),
}))

import {
  BACKGROUND_TASK_KINDS,
  executeRegisteredBackgroundTask,
} from "@/lib/background-task-executors"

describe("background task executor registry", () => {
  it("keeps AIM and outbox tasks without the retired direct reply task", async () => {
    expect(BACKGROUND_TASK_KINDS).toEqual(expect.arrayContaining([
      "inspiration_pipeline",
      "inspiration_outbox_send",
      "aim_channel_generate",
    ]))
    expect(BACKGROUND_TASK_KINDS).not.toContain("inspiration_reply")
    await expect(executeRegisteredBackgroundTask("inspiration_reply", "task-1")).resolves.toBe(false)
  })
})
