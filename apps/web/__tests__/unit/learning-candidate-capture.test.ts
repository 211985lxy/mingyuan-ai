import { describe, expect, it } from "vitest"
import {
  buildLearningCandidateDrafts,
} from "@/lib/aim/learning-candidate-capture"

function metadata(disposition: string) {
  return {
    workflowId: "growth",
    taskType: "content",
    finalDisposition: disposition,
    humanActiveMinutes: 10,
    manualBaselineMinutes: 30,
    channel: "web",
    requestId: `request_${disposition}_${Math.random().toString(36).slice(2, 6)}`,
  }
}

describe("learning candidate capture", () => {
  it("拒绝、质量失败、高成本和经营失败进入候选，neutral 不进入", () => {
    const drafts = buildLearningCandidateDrafts({
      traces: [
        {
          id: "trace_quality",
          runId: "run_quality",
          userId: "user_1",
          projectId: "project_1",
          aimGenerationId: "generation_1",
          status: "failed",
          durationMs: 1000,
          costCny: 1,
          qualityStatus: "fail",
          errorMessage: "quality",
        },
        {
          id: "trace_cost",
          runId: "run_cost",
          userId: "user_1",
          projectId: "project_1",
          aimGenerationId: "generation_2",
          status: "success",
          durationMs: 130_000,
          costCny: 6,
          qualityStatus: "pass",
          errorMessage: null,
        },
      ],
      events: [{
        id: "event_rejected",
        runId: "run_quality",
        event: "final_disposition",
        metadata: metadata("rejected"),
        createdAt: new Date("2026-07-29T00:00:00Z"),
      }],
      outcomes: [
        {
          id: "outcome_failed",
          projectId: "project_1",
          generationId: "generation_1",
          verdictCode: "failed",
          verdictNote: "未达标",
          collectWindowDay: 7,
        },
        {
          id: "outcome_neutral",
          projectId: "project_1",
          generationId: "generation_2",
          verdictCode: "neutral",
          verdictNote: null,
          collectWindowDay: 7,
        },
      ],
    })
    expect(drafts.map((draft) => draft.requestId)).toEqual(expect.arrayContaining([
      "lc:trace:trace_quality:eval_fixture",
      "lc:trace:trace_quality:methodology_revision",
      "lc:trace:trace_cost:eval_fixture",
      "lc:trace:trace_cost:methodology_revision",
      "lc:run_event:event_rejected:eval_fixture",
      "lc:run_event:event_rejected:methodology_revision",
      "lc:content_outcome:outcome_failed:eval_fixture",
      "lc:content_outcome:outcome_failed:methodology_revision",
    ]))
    expect(drafts.some((draft) => draft.sourceId === "outcome_neutral")).toBe(false)
  })

  it("同样输入生成稳定幂等键", () => {
    const input = {
      traces: [{
        id: "trace_1",
        runId: "run_1",
        userId: null,
        projectId: null,
        aimGenerationId: null,
        status: "failed",
        durationMs: null,
        costCny: null,
        qualityStatus: null,
        errorMessage: "failed",
      }],
      events: [],
      outcomes: [],
    }
    expect(buildLearningCandidateDrafts(input)[0]?.requestId).toBe(
      buildLearningCandidateDrafts(input)[0]?.requestId,
    )
  })

  it("逐条 rewrite/reject 建候选，后续 accepted_after_edit 不能吞掉早先重写", () => {
    const drafts = buildLearningCandidateDrafts({
      traces: [],
      events: [
        {
          id: "event_rewrite",
          runId: "run_event_only",
          event: "final_disposition",
          metadata: metadata("rewrite_requested"),
          createdAt: new Date("2026-07-29T01:00:00Z"),
        },
        {
          id: "event_reject",
          runId: "run_event_only",
          event: "final_disposition",
          metadata: metadata("rejected"),
          createdAt: new Date("2026-07-29T02:00:00Z"),
        },
        {
          id: "event_accepted",
          runId: "run_event_only",
          event: "final_disposition",
          metadata: metadata("accepted_after_edit"),
          createdAt: new Date("2026-07-29T03:00:00Z"),
        },
      ],
      outcomes: [],
    })
    const ids = drafts.map((draft) => draft.requestId).sort()
    expect(ids).toEqual([
      "lc:run_event:event_reject:eval_fixture",
      "lc:run_event:event_reject:methodology_revision",
      "lc:run_event:event_rewrite:eval_fixture",
      "lc:run_event:event_rewrite:methodology_revision",
    ].sort())
    expect(drafts.some((draft) => draft.sourceId === "event_accepted")).toBe(false)
  })
})
