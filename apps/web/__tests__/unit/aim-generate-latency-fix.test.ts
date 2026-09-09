import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"

import { resolveSemanticUnderstandingFastPath } from "@/lib/aim/semantic-task-understanding"
import { verifyUnifiedGenerationCandidate } from "@/lib/aim/unified-generation-gate"
import { AIM_FAST_SPOKEN_ROUTE_KEY } from "@/lib/aim-harness/fast-spoken-policy"
import type { AimGenerateContext } from "@/lib/aim/agent-types"

describe("AIM generate latency fixes", () => {
  it("skips LLM semantic understanding when enough source material is present", () => {
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

  // 2026-09-09 生产事故回归：对标原文长粘贴满是「为什么/是否」类反问钩子，
  // 曾被问句模式整段误判成 respond，对标改写 5 连败（走了回答分支被校验打回）。
  it("long benchmark pastes with rhetorical questions route to deliver, not respond", () => {
    const longBenchmarkPaste = [
      "对标标题：潮汕人生意口诀#生意#潮汕人 #商业思维",
      "对标原文：",
      "我们潮汕人的生意口诀，最后一句最值钱。你知道为什么有的人做生意总能赚到钱吗？",
      ...Array.from({ length: 20 }, (_, i) => `第${i + 1}条：生意场上，是否诚信决定了你能走多远，为什么口碑比流量更重要？`),
      "关注我，学会更多生意经。",
    ].join("\n")
    expect(longBenchmarkPaste.length).toBeGreaterThan(120)
    expect(resolveSemanticUnderstandingFastPath({
      currentUserRequest: longBenchmarkPaste,
      relevantConversation: [],
      referenceMaterials: [],
    })?.handling).toBe("deliver")
  })

  it("benchmark pastes ending with a question mark still route to deliver", () => {
    const paste = [
      "对标标题：不良资产如何赚钱#认知 #创业 #不良资产处置",
      "对标原文：都知道不良资产很赚钱，那你知道不良资产到底为什么赚钱吗？你适合哪个环节？普通人能不能分一杯羹？",
      "今天一次讲清楚。不良资产不是坏账，是打折的资产。银行把收不回来的贷款打包卖出去，专业机构接手后通过各种方式处置回现，赚的就是中间的差价。",
      "你适合哪个环节？想知道的话关注我。你适合哪个环节？",
    ].join("\n")
    expect(paste.length).toBeGreaterThan(120)
    expect(resolveSemanticUnderstandingFastPath({
      currentUserRequest: paste,
      relevantConversation: [],
      referenceMaterials: [],
    })?.handling).toBe("deliver")
  })

  it("genuine long analysis questions ending with a question mark still route to respond", () => {
    // 口头提到「对标文案」不带冒号结构标记，不应触发对标粘贴守卫
    const longQuestion = "我贴的这篇对标文案里，作者在开头用了连续三个反问句做钩子，中间用第一人称故事建立信任，结尾落到课程转化，这整个结构是什么类型？为什么开场要先用反问而不是直接讲干货？"
    expect(longQuestion.length).toBeGreaterThan(80)
    expect(resolveSemanticUnderstandingFastPath({
      currentUserRequest: longQuestion,
      relevantConversation: [],
      referenceMaterials: [],
    })?.handling).toBe("respond")
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
