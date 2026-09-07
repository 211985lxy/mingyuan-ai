import { describe, expect, it } from "vitest"

import { runAimHarness } from "@/lib/aim-harness/runner"
import { AimRunExecutionError } from "@/lib/aim-error-message"
import { reportProviderAttempt } from "@/lib/llm/telemetry"
import { AimDeadlineExceededError } from "@/lib/llm/execution-deadline"

describe("runAimHarness failure telemetry", () => {
  it("keeps runId and providerAttempts when the executor throws", async () => {
    await expect(runAimHarness({
      plan: {
        entrypoint: "generate",
        agentId: "content_producer",
        rawInput: "写一条口播",
        targetFormats: ["video_script"],
      },
      execute: async () => {
        reportProviderAttempt({
          provider: "zenmux",
          model: "anthropic/claude-sonnet-4.6",
          status: "failed",
          errorKind: "timeout",
          error: "timed out",
          attemptIndex: 0,
        })
        throw new Error("zenmux timed out")
      },
    })).rejects.toMatchObject({
      name: "AimRunExecutionError",
      code: "MODEL_TIMEOUT",
      runId: expect.stringMatching(/^run_/),
    })
  })

  it("classifies a shared deadline as GENERATION_DEADLINE", async () => {
    try {
      await runAimHarness({
        plan: {
          entrypoint: "generate",
          agentId: "content_producer",
          rawInput: "写一条口播",
          targetFormats: ["video_script"],
        },
        execute: async () => {
          throw new AimDeadlineExceededError()
        },
      })
      throw new Error("expected failure")
    } catch (error) {
      expect(error).toBeInstanceOf(AimRunExecutionError)
      expect((error as AimRunExecutionError).code).toBe("GENERATION_DEADLINE")
      expect((error as AimRunExecutionError).runId).toMatch(/^run_/)
    }
  })
})
