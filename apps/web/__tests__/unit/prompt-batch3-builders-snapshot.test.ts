import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

/**
 * 批 3 / WP-1.2：内容创作官 / 统一生成 / 分层骨架 / 脚本生成 的 builder 快照。
 * 生成：UPDATE_PROMPT_BATCH3_SNAPSHOT=1 vitest run 本文件
 */

import { buildContentProducerChatPrompt } from "@/lib/aim-agent-prompts"
import {
  buildProducerSystemPrompt,
  buildUserPrompt,
  composeLayeredAimPrompt,
} from "@/lib/aim-generation-prompts"
import {
  buildUnifiedProducerSystemPrompt,
  buildUnifiedProducerUserPrompt,
} from "@/lib/aim/unified-content-prompts"
import { buildMetaPromptMessages } from "@/lib/script-generation/meta-prompt"
import {
  buildDirectGenerationPrompt,
  buildMetaPromptText,
} from "@/lib/script-generation/prompts"

const SNAPSHOT_PATH = resolve(__dirname, "__fixtures__/prompt-batch3-builders-snapshot.json")
const observed: Record<string, string> = {}

function observe(name: string, value: unknown) {
  observed[name] = typeof value === "string" ? value : JSON.stringify(value)
}

function genContext(overrides: Record<string, unknown> = {}) {
  return {
    userId: "u1",
    agentId: "content_producer",
    rawInput: "按框架写一篇口播",
    targetFormats: ["raw_copy"],
    knowledgeBlock: "",
    methodologyBlock: "",
    selectedMethodologyBlock: "",
    businessDiagnosisBlock: "",
    viralStructureBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock: "",
    retrievedEntries: [],
    retrievedSource: "raw",
    knowledgeStrategy: "deep",
    ...overrides,
  } as never
}

const TOPIC = {
  topicSelectionId: "ts1",
  topicTitle: "供暖改造",
  elementTags: ["curiosity"],
  openingTypeCode: "curiosity_open",
  openingTypeName: "好奇开场",
  openingFormulas: ["你有没有发现……", "为什么别人……"],
  copyStructureCode: "three_beat_ramp",
  copyStructureName: "三拍递进",
  copyStructureBeats: [
    { label: "钩子", instruction: "先抛冲突" },
    { label: "证据", instruction: "给一个现场" },
  ],
  endingTypeCode: "interactive",
  endingTypeName: "互动收尾",
  endingGuidance: "用提问收",
  endingPatterns: ["评论区告诉我"],
}

const SCRIPT_PARAMS = {
  template: {
    id: "t1",
    displayName: "口播",
    description: "",
    scriptTemplate: "",
    hookType: "hook",
  },
  inputs: {},
  structure: { blueprint: { durationRange: { min: 45, max: 60 } } },
}

const DIRECTIONS = [
  {
    openingStrategy: "冲突开场",
    narrativeStyle: "现场还原",
    coreArgument: "先改系统再谈流量",
    endingRequirement: "私信关键词",
  },
]

describe("批3 builder prompt 快照", () => {
  it("捕获主创作 builder 输出并与基线逐字节比对", () => {
    observe("contentProducer.chat.empty", buildContentProducerChatPrompt({
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
    }))
    observe("contentProducer.chat.light_edit", buildContentProducerChatPrompt({
      knowledgeBlock: "【知识】供暖",
      methodologyBlock: "【方法论】钩子",
      ipWikiBlock: "【IPwiki】直率",
      runtimeTask: "light_edit",
      rawInput: "只改开头",
      workflowContext: "【任务单】轻改",
    }))
    observe("contentProducer.chat.rewrite", buildContentProducerChatPrompt({
      knowledgeBlock: "【知识】供暖",
      methodologyBlock: "【方法论】钩子",
      selectedMethodologyBlock: "【指定】5A",
      ipWikiBlock: "【IPwiki】直率",
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "rewrite",
      rawInput: "按对标文案改写",
      hasBenchmarkText: true,
      includeHighRisk: true,
      includePublishPackage: true,
      includeOperatingLogicFull: true,
    }))

    observe("contentProducer.generate.system", buildProducerSystemPrompt("agent prompt", genContext({
      knowledgeBlock: "【知识】供暖",
      methodologyBlock: "【方法论】钩子",
      ipWikiBlock: "【IPwiki】直率",
      runtimeTask: "new_copy",
      targetFormats: ["video_script"],
    })))
    observe("contentProducer.generate.user", buildUserPrompt(genContext({
      knowledgeBlock: "【知识】供暖",
      runtimeTask: "new_copy",
      targetFormats: ["video_script"],
    }), "【口播文案】要求"))
    observe("contentProducer.generate.user.light_edit", buildUserPrompt(genContext({
      rawInput: "原稿：这段表达太空。",
      runtimeTask: "light_edit",
      targetFormats: ["raw_copy"],
    }), "格式块"))

    observe("layered.emptyFormat", composeLayeredAimPrompt({
      roleBlock: "角色",
      runtimeTask: undefined,
      contextBlocks: [],
      qualityRedlines: ["红线"],
    }))
    observe("layered.full", composeLayeredAimPrompt({
      roleBlock: "角色",
      runtimeTask: "light_edit",
      taskConstraintExtra: "额外约束",
      contextBlocks: ["档案"],
      formatBlock: "格式",
      qualityRedlines: ["红线"],
    }))

    const unifiedContext = genContext({
      unifiedContentExecution: {
        brief: "交付口播",
        envelope: {
          currentUserRequest: "按框架写口播",
          relevantConversation: [{ role: "user", content: "上轮只改开头" }],
          referenceMaterials: [{ title: "框架", content: "故事型" }],
        },
      },
      ipWikiBlock: "【IPwiki】直率",
      knowledgeBlock: "【知识】供暖",
      targetFormats: ["video_script"],
    })
    observe("unified.system", buildUnifiedProducerSystemPrompt(unifiedContext))
    observe("unified.user", buildUnifiedProducerUserPrompt(unifiedContext, "口播格式要求"))

    observe("script.meta.noTopic", buildMetaPromptMessages("上下文块", SCRIPT_PARAMS as never))
    observe("script.meta.withTopic", buildMetaPromptMessages("上下文块", {
      ...SCRIPT_PARAMS,
      topicContext: TOPIC,
    } as never))
    observe("script.direct.noTopic", buildDirectGenerationPrompt("上下文块", SCRIPT_PARAMS as never))
    observe("script.direct.withTopic", buildDirectGenerationPrompt("上下文块", {
      ...SCRIPT_PARAMS,
      topicContext: TOPIC,
    } as never))
    observe("script.metaText.noTopic", buildMetaPromptText("上下文块", SCRIPT_PARAMS as never, DIRECTIONS))
    observe("script.metaText.withTopic", buildMetaPromptText("上下文块", {
      ...SCRIPT_PARAMS,
      topicContext: TOPIC,
    } as never, DIRECTIONS))

    expect(Object.keys(observed).length).toBeGreaterThanOrEqual(14)

    if (process.env.UPDATE_PROMPT_BATCH3_SNAPSHOT) {
      mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true })
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(observed, null, 2) + "\n", "utf8")
      return
    }

    const baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, string>
    for (const [name, value] of Object.entries(baseline)) {
      expect(observed[name], `快照案例 ${name} 缺失`).toBeDefined()
      expect(value, `快照案例 ${name} 与迁移前基线不一致`).toBe(observed[name])
    }
    expect(Object.keys(observed).sort()).toEqual(Object.keys(baseline).sort())
  })
})
