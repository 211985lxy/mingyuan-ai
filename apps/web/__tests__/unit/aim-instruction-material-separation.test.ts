import { describe, expect, it } from "vitest"

import {
  AIM_BENCHMARK_MATERIAL_PATTERN,
  countAimMaterialChars,
  extractAimInstructionText,
  hasWechatDraftIntent,
} from "@/lib/aim-current-user-input"
import { buildAimRawInput } from "@/lib/aim/workbench-helpers"
import {
  buildNumberedClarification,
  collectIntentClarificationGaps,
  resolveUserIntentFromEnvelope,
} from "@/lib/aim/resolved-user-intent"
import { resolveMountedRuleBlocks } from "@/lib/aim/mounted-rule-blocks"
import { inferContentFormatsFromRawInput } from "@/lib/aim-format-inference"
import { hasExplicitNewTaskIntent } from "@/lib/aim-workbench-commands"
import { tryResolveInterviewIntent } from "@/lib/aim-interview-routing"
import { resolveAimTurnIntent } from "@/lib/aim-turn-intent"
import { resolveExecuteTurnGate } from "@/lib/aim/execute-turn-intent-gate"
import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

/**
 * 指令/素材分离守护测试（2026-09 系列事故根治）。
 * 语料来自生产真实失败样本形态：对标粘贴满是反问钩子/#tag/「开头」「这段」
 * 「适合宝妈」「品牌」「接下来写」等词——这些词出现在素材里时，不得改变任何
 * 入口层规则的判定。
 */

const benchmarkPaste = [
  "对标标题：潮汕人生意口诀#生意 #潮汕人 #商业思维 #经商之道 @抖音小助手",
  "对标原文：",
  "我们潮汕人的生意口诀，最后一句最值钱。你知道为什么有的人做生意总能赚到钱吗？",
  "开头：大家好，今天讲讲潮汕人的生意经。第二段：适合宝妈在家做的生意，品牌很重要。",
  "这篇结构是什么类型？为什么开场要先用反问？接下来写什么？这段话要怎么改？",
  "做300字拆解，3条建议，发布到公众号，配一个发布包，再做个爆款拆解和采访提纲。",
  "已有拆解：",
  "1. 冲突开场（为什么穷人事多）2. 身份背书 3. 口诀清单 4. 结尾CTA",
].join("\n")

const instructionBeforePaste = `按对标原文的节奏改写一版\n\n${benchmarkPaste}`

function envelopeOf(request: string, extra?: Partial<AimContentSourceEnvelope>): AimContentSourceEnvelope {
  return {
    currentUserRequest: request,
    relevantConversation: [],
    referenceMaterials: [],
    ...extra,
  }
}

describe("extractAimInstructionText 指令抽取", () => {
  it("纯对标粘贴（无指令）抽取为空串", () => {
    expect(extractAimInstructionText(benchmarkPaste)).toBe("")
  })

  it("指令 + 素材：只取素材标记之前的指令", () => {
    expect(extractAimInstructionText(instructionBeforePaste)).toBe("按对标原文的节奏改写一版")
  })

  it("历史拼接（buildAimRawInput 带标记）：只取本轮指令并截断素材", () => {
    const messages: AimWorkbenchMessage[] = [
      { id: "m1", role: "user", content: "之前说过要写给实体店老板" },
      { id: "m2", role: "assistant", content: "好的" },
    ]
    const raw = buildAimRawInput(messages, `改写这篇\n\n${benchmarkPaste}`)
    expect(extractAimInstructionText(raw)).toBe("改写这篇")
  })

  it("无任何标记的纯指令原样返回", () => {
    expect(extractAimInstructionText("  帮我写一条口播文案，讲私域获客 ")).toBe("帮我写一条口播文案，讲私域获客")
  })

  it("素材字符量统计与对标结构标记", () => {
    expect(countAimMaterialChars(instructionBeforePaste)).toBeGreaterThan(100)
    expect(AIM_BENCHMARK_MATERIAL_PATTERN.test(benchmarkPaste)).toBe(true)
    expect(AIM_BENCHMARK_MATERIAL_PATTERN.test("聊聊对标文案怎么写")).toBe(false)
  })
})

describe("素材免疫：素材里的词不得改变规则判定", () => {
  it("纯对标粘贴 → benchmark_rewrite，零追问，不追问受众/目标", () => {
    const intent = resolveUserIntentFromEnvelope(envelopeOf(benchmarkPaste))
    expect(intent.taskKind).toBe("benchmark_rewrite")
    expect(collectIntentClarificationGaps(intent)).toEqual([])
    expect(buildNumberedClarification(collectIntentClarificationGaps(intent))).toBeUndefined()
  })

  it("意图门：纯对标粘贴 handling=deliver 时不触发追问", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf(benchmarkPaste),
      handling: "deliver",
      formats: ["video_script"],
    })
    expect(gate.clarification).toBeNull()
    expect(gate.intent.taskKind).toBe("benchmark_rewrite")
  })

  it("素材里的范围词/受众/目标/数量/长度不成为硬约束", () => {
    const intent = resolveUserIntentFromEnvelope(envelopeOf(benchmarkPaste))
    expect(intent.modificationScope).toBeUndefined()
    expect(intent.audience).toBeUndefined()
    expect(intent.goal).toBeUndefined()
    expect(intent.quantity).toBeUndefined()
    expect(intent.lengthPolicy).toBe("unset")
  })

  it("素材里的新旧任务词不切断已确认约束", () => {
    const intent = resolveUserIntentFromEnvelope(envelopeOf(benchmarkPaste, {
      relevantConversation: [
        { role: "assistant", content: "在动笔前先确认 1 件事（直接按编号回答即可）：" },
        { role: "user", content: "写给宝妈，2分钟" },
      ],
    }))
    expect(intent.isNewTask).toBe(false)
  })

  it("规则块挂载：素材词不挂爆款/发布包；对标素材仍挂防抄袭", () => {
    const blocks = resolveMountedRuleBlocks({ request: benchmarkPaste })
    expect(blocks).toContain("benchmark_guardrail")
    expect(blocks).not.toContain("viral_toolkit")
    expect(blocks).not.toContain("publish_package")
    // 指令里的真实意图仍正常挂载
    expect(resolveMountedRuleBlocks({ request: "优化一下开头钩子，做个爆款拆解" })).toContain("viral_toolkit")
  })

  it("格式推断：素材提到公众号/分镜/小红书不混入输出格式", () => {
    expect(inferContentFormatsFromRawInput(benchmarkPaste)).toEqual([])
    expect(inferContentFormatsFromRawInput("写一篇小红书种草图文")).toEqual(["xiaohongshu_post"])
  })

  it("新任务判定：素材里的「接下来写/换个话题」不触发", () => {
    expect(hasExplicitNewTaskIntent(benchmarkPaste)).toBe(false)
    expect(hasExplicitNewTaskIntent("换一篇，写个新的选题")).toBe(true)
  })

  it("公众号草稿意图：素材里的「发布到公众号」不触发", () => {
    expect(hasWechatDraftIntent(benchmarkPaste)).toBe(false)
    expect(hasWechatDraftIntent("写完帮我推到草稿箱")).toBe(true)
  })

  it("采访路由：素材里的「采访」不劫持", () => {
    expect(tryResolveInterviewIntent({ text: benchmarkPaste })).toBeNull()
    expect(tryResolveInterviewIntent({ text: "开始采访，做老板说明书" })?.action).toBe("interview_build_profile")
  })

  it("turn-intent：素材不把 action 拉离结构判定", () => {
    // runtimeTask=new_copy 时素材里的「优化/这段/开头」不得改成 local_edit
    const intent = resolveAimTurnIntent({ rawInput: benchmarkPaste, runtimeTask: "new_copy" })
    expect(intent.action).not.toBe("local_edit")
  })
})

describe("指令仍被正确解析（分离不误伤）", () => {
  it("指令里的受众/目标/长度照常成为约束", () => {
    const intent = resolveUserIntentFromEnvelope(
      envelopeOf("写给实体店老板，写一条2分钟口播，目标是获客留资"),
    )
    expect(intent.audience).toContain("实体店老板")
    expect(intent.goal).toBe("lead")
    expect(intent.lengthPolicy).toBe("user_explicit")
    expect(intent.taskKind).toBe("new_draft")
  })

  it("结构化分离后的对标请求：指令短、素材在 referenceMaterials", () => {
    const intent = resolveUserIntentFromEnvelope(envelopeOf("请按对标原文重新生成一版文案，直接输出最终稿。", {
      referenceMaterials: [{ title: "对标原文", content: benchmarkPaste }],
    }))
    expect(intent.taskKind).toBe("benchmark_rewrite")
    expect(collectIntentClarificationGaps(intent)).toEqual([])
  })

  it("长分析问句（以？收尾）仍是 answer_question", () => {
    const intent = resolveUserIntentFromEnvelope(
      envelopeOf("我贴的这篇对标文案里，作者在开头用了连续三个反问句做钩子，这整个结构是什么类型？为什么开场要先用反问而不是直接讲干货？"),
    )
    expect(intent.taskKind).toBe("answer_question")
  })
})
