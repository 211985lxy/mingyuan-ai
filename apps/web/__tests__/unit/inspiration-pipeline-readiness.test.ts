import { describe, expect, it } from "vitest"
import { assessInspirationPipelineReadiness } from "@/lib/inspiration-pipeline-readiness"

describe("assessInspirationPipelineReadiness", () => {
  it("defaults to shadow-friendly level when enabled without live override", () => {
    const result = assessInspirationPipelineReadiness({
      INSPIRATION_PIPELINE_ENABLED: "true",
      BACKGROUND_TASKS_ENABLED: "true",
      CRON_SECRET: "secret",
      FEISHU_TOPIC_PIPELINE_ENABLED: "true",
    })
    expect(result.ok).toBe(true)
    expect(result.level).toBe("shadow")
    expect(result.nextActions.some((item) => item.includes("evaluate"))).toBe(true)
  })

  it("marks live when override is live and shadow flag off", () => {
    const result = assessInspirationPipelineReadiness({
      INSPIRATION_PIPELINE_ENABLED: "true",
      BACKGROUND_TASKS_ENABLED: "true",
      CRON_SECRET: "secret",
      FEISHU_TOPIC_PIPELINE_ENABLED: "true",
      INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE: "live",
      INSPIRATION_PIPELINE_SHADOW_MODE: "false",
    })
    expect(result.level).toBe("live")
    expect(result.ok).toBe(true)
  })

  it("fails closed when cron secret missing", () => {
    const result = assessInspirationPipelineReadiness({
      INSPIRATION_PIPELINE_ENABLED: "true",
      BACKGROUND_TASKS_ENABLED: "true",
      CRON_SECRET: "",
      FEISHU_TOPIC_PIPELINE_ENABLED: "true",
    })
    expect(result.ok).toBe(false)
    expect(result.checks.some((c) => c.id === "cron_secret" && !c.passed)).toBe(true)
  })
})
