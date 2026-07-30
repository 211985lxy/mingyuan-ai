import { describe, expect, it } from "vitest"

import { buildWorkflowContext, buildCompactWorkflowContext, composeLayeredAimPrompt, buildUserPrompt } from "@/lib/aim-generation-prompts"
import { inferContentFormatsFromRawInput } from "@/lib/aim-format-inference"
import { buildContentProducerKnowledgeRule } from "@/lib/aim-agent-prompts"
import { buildPromptFewshotBlock } from "@/lib/aim-prompt-fewshots"
import { resolveAimRuntimeTask } from "@/lib/aim-knowledge-strategy"
import { resolveAimChannelIntent } from "@/lib/aim-channel-router"
import {
  buildTaskSpecSkeleton,
  enrichTaskSpecFromRawInput,
} from "@/lib/task-spec"
import { LIGHT_EDIT_OUTPUT_BOUNDARY } from "@/lib/aim-intent-boundaries"

describe("TaskSpec enrich + workflow render", () => {
  it("fills contentTask/platform and renders knownFacts into workflow context", () => {
    const skeleton = buildTaskSpecSkeleton({
      agentId: "content_producer",
      rawInput: "写一篇小红书种草，引导私信",
      project: { targetCustomer: "本地服务老板", offer: "陪跑营", industry: "教育", deliveryGoal: "咨询" },
      topicSelection: null,
      knowledgeTitles: [],
    })
    const enriched = enrichTaskSpecFromRawInput(skeleton, "写一篇小红书种草，引导私信")
    expect(enriched.contentTask).toBeTruthy()
    expect(enriched.platform).toBe("小红书")
    expect(enriched.desiredAction).toBe("私信")
    expect(enriched.knownFacts.length).toBeGreaterThan(0)

    const workflow = buildWorkflowContext({ taskSpec: enriched })
    expect(workflow).toContain("已知事实")
    expect(workflow).toContain("协作模式")
    expect(workflow).toContain("本地服务老板")
  })

  it("compact workflow keeps facts for free_copywriter", () => {
    const spec = enrichTaskSpecFromRawInput(
      buildTaskSpecSkeleton({
        agentId: "free_copywriter",
        rawInput: "写朋友圈 100 字",
        project: { offer: "诊断服务" },
        topicSelection: null,
        knowledgeTitles: [],
      }),
      "写朋友圈 100 字",
    )
    const compact = buildCompactWorkflowContext(spec)
    expect(compact).toContain("已知事实")
    expect(compact).toMatch(/朋友圈|100/)
  })
})

describe("format inference + routing", () => {
  it("infers xiaohongshu_post from 种草文", () => {
    expect(inferContentFormatsFromRawInput("写一篇小红书种草文")).toEqual(["xiaohongshu_post"])
  })

  it("routes 种草+人设 to new_copy not positioning_topic", () => {
    expect(resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "结合人设写一篇小红书种草文",
    })).toBe("new_copy")
  })

  it("routes 优化开头 to light_edit", () => {
    expect(resolveAimRuntimeTask({
      agentId: "content_producer",
      input: "优化这篇开头",
    })).toBe("light_edit")
  })

  it("passage polish user prompt frames SOURCE and forbids long rewrite", () => {
    const prompt = buildUserPrompt({
      rawInput: "养了一个内容团队，月底却算不出获客。\n\n优化这段话",
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      targetFormats: ["video_script"],
      agentId: "content_producer",
    } as never, "===FORMAT:video_script===")
    expect(prompt).toContain("【待润色原文与要求】")
    expect(prompt).toContain("禁止另起长口播")
  })

  it("channel aliases cover 人设梳理官 and 自由撰稿人", () => {
    expect(resolveAimChannelIntent("/人设梳理官 开始").agentId).toBe("content_producer")
    expect(resolveAimChannelIntent("/自由撰稿人 写一段").agentId).toBe("free_copywriter")
  })
})

describe("layered prompt + knowledge rule + fewshot", () => {
  it("composeLayeredAimPrompt keeps layer headings", () => {
    const prompt = composeLayeredAimPrompt({
      roleBlock: "角色",
      runtimeTask: "light_edit",
      contextBlocks: ["档案"],
      formatBlock: "格式",
      qualityRedlines: ["红线"],
    })
    expect(prompt).toContain("【系统角色】")
    expect(prompt).toContain("【任务约束】")
    expect(prompt).toContain("【上下文素材】")
    expect(prompt).toContain("【输出格式】")
    expect(prompt).toContain("【质量红线】")
    expect(prompt).toContain(LIGHT_EDIT_OUTPUT_BOUNDARY.slice(0, 8))
  })

  it("conversion knowledge rule requires archive grounding", () => {
    const rule = buildContentProducerKnowledgeRule({
      runtimeTask: "new_copy",
      knowledgeStrategy: "conversion",
    })
    expect(rule).toContain("必须落地档案")
  })

  it("fewshot skipped for light_edit", () => {
    expect(buildPromptFewshotBlock("light_edit", ["video_script"])).toBe("")
    expect(buildPromptFewshotBlock("new_copy", ["video_script"]).length).toBeGreaterThan(0)
  })
})
