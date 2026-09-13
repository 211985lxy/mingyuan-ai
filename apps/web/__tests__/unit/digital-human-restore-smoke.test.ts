import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { ACTIVE_VIDEO_TASK_STATUSES, isActiveVideoTaskStatus } from "@/lib/video-task-domain"
import { VALID_VIDEO_TASK_TYPES } from "@/lib/video-task-request/contracts"
import { PLAN_CONCURRENCY_LIMITS } from "@/types/content-template"
import { AIM_AGENT_GUIDES } from "@/lib/aim-agent-guides"
import {
  getDigitalHumanAuthorizationText,
  getDigitalHumanProvider,
  hasExactDigitalHumanAuthorizationText,
  matchesDigitalHumanAuthorizationText,
} from "@/lib/digital-human-provider"

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

  it("defaults the digital-human provider to Chanjing", () => {
    expect(getDigitalHumanProvider()).toBe("chanjing")
  })

  it("does not auto-trigger paid 4K enhancement after first-phase delivery", () => {
    const settlement = readFileSync(
      resolve(__dirname, "../../src/lib/video-task-settlement.ts"),
      "utf8",
    )
    expect(settlement).not.toContain("triggerVideoEnhancement")
  })

  it("never falls back to the branding name for authorization text", () => {
    const route = readFileSync(
      resolve(__dirname, "../../src/app/api/auth/auth-video/route.ts"),
      "utf8",
    )
    expect(route).not.toContain("getBrandingConfig")
    expect(matchesDigitalHumanAuthorizationText("  授权原文\r\n", "授权原文")).toBe(true)
    expect(matchesDigitalHumanAuthorizationText("另一段文案", "授权原文")).toBe(false)
    expect(hasExactDigitalHumanAuthorizationText("明显不匹配的授权文案", "chanjing")).toBe(false)
    expect(typeof getDigitalHumanAuthorizationText).toBe("function")
  })
})
