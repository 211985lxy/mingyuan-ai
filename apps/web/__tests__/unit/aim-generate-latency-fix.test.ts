import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import { resolveSemanticUnderstandingFastPath } from "@/lib/aim/semantic-task-understanding"
import { verifyUnifiedGenerationCandidate } from "@/lib/aim/unified-generation-gate"
import { AIM_FAST_SPOKEN_ROUTE_KEY } from "@/lib/aim-harness/fast-spoken-policy"
import type { AimGenerateContext } from "@/lib/aim/agent-types"

describe("AIM generate latency fixes", () => {
  it("skips LLM semantic understanding for an explicit creation request", () => {
    const result = resolveSemanticUnderstandingFastPath({
      currentUserRequest: "按下面材料写一条口播",
      relevantConversation: [],
      referenceMaterials: [{
        title: "创始人IP要点",
        content: "创始人IP的核心不是流量，而是信任。信任分四层：流量、获客、信任、宗教。",
      }],
    })

    expect(result).toEqual({
      handling: "deliver",
      brief: "按下面材料写一条口播",
    })
  })

  it("routes analysis questions to respond without an LLM call", () => {
    expect(resolveSemanticUnderstandingFastPath({
      currentUserRequest: "这篇文案是什么结构？",
      relevantConversation: [],
      referenceMaterials: [],
      currentArtifact: { content: "先冲突，再原因，最后行动。" },
    })).toEqual({
      handling: "respond",
      brief: "这篇文案是什么结构？",
    })
  })

  it("does not treat a long ordinary discussion as a delivery request", () => {
    const request = "我觉得这里被工作流限制得太严重了。用户只是在讨论岗位之间如何配合，并没有要求生成文案，也没有要求改写作品。系统应该先听懂当前问题并正常交流，不应该因为输入内容比较长，就自动要求填写目标用户、内容目标和任务卡。这样日常沟通才不会一直被创作流程打断。"

    expect(resolveSemanticUnderstandingFastPath({
      currentUserRequest: request,
      relevantConversation: [],
      referenceMaterials: [],
    })).toBeNull()
  })

  it("does not run unified semantic verifier on fast spoken route", async () => {
    const verify = vi.fn()
    const context = {
      unifiedContentExecution: {
        envelope: {
          currentUserRequest: "写口播",
          relevantConversation: [],
          referenceMaterials: [],
        },
        brief: "写口播",
      },
      modelPolicy: { routeKey: AIM_FAST_SPOKEN_ROUTE_KEY },
    } as unknown as AimGenerateContext

    await expect(verifyUnifiedGenerationCandidate({
      context,
      parsed: { video_script: "完整口播正文" },
      targetFormats: ["video_script"],
      agentId: "content_producer",
    })).resolves.toEqual({ passed: true })

    expect(verify).not.toHaveBeenCalled()
  })

  it("keeps fast spoken enabled for unified execute planner input", () => {
    const plannerSource = readFileSync(
      join(process.cwd(), "src/lib/aim-harness/planner.ts"),
      "utf8",
    )

    expect(plannerSource).not.toContain("!input.unifiedContentExecution && isAimFastSpokenRun")
    expect(plannerSource).toContain("const fastSpoken = isAimFastSpokenRun({")
  })
})
