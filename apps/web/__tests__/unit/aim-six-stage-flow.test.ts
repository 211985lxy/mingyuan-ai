import { describe, expect, it } from "vitest"
import { AIM_SIX_STAGE_LABELS, canAdvanceAimSixStage, getNextAimSixStage } from "@/lib/aim-six-stage-flow"

describe("六关内容工作流", () => {
  it("按调研→选题→创作→编辑→发布→复盘顺序推进", () => {
    expect(getNextAimSixStage("research")).toBe("topic")
    expect(getNextAimSixStage("edit")).toBe("publish")
    expect(canAdvanceAimSixStage("edit", "publish")).toBe(true)
    expect(canAdvanceAimSixStage("edit", "results")).toBe(false)
    expect(AIM_SIX_STAGE_LABELS.results).toBe("信息复盘")
  })
})
