import { describe, expect, it } from "vitest"

import {
  detectSpokenChainOfThoughtLeakage,
  extractSpokenFinalDraft,
  isSpokenChainOfThoughtLeaked,
} from "@/lib/aim-generation-text"
import { formatAimContinuationDirective, isAimContinuationInput } from "@/lib/aim-turn-intent"
import { buildWorkflowContext } from "@/lib/aim-generation-prompts"

// 还原自生产真实泄漏样本（2026-08-19，content_producer + "继续"输入）
const METHOD_NOTE = `[[AIM_METHOD_NOTE]]
### 目标判定
- businessGoal：lead
- 依据：source=inferred；confidence=0.45
[[/AIM_METHOD_NOTE]]`

const LEAKED_BODY = `好的老板。

需要先判断一下当前的情况。用户说“继续”，工作流上下文给了完整任务单：本次意图是新建口播脚本，目标是“继续”，业务是法拍房/不良资产。

上一轮输出已经有一条口播脚本，质检未通过，原因是：结尾只留一个轻行动。

写正文草稿：

比市场价低两三成的房子，挂了两轮没人举牌。你以为是房子有问题？不是。是大家心里都清楚，便宜背后一定有代价。

法拍房这个市场，卡住大多数人的不是钱，是信息。你手里钱备好了，房子也看了小半年，好不容易碰到一套价格漂亮的，想拍又不敢拍。怕错过，更怕踩坑。

检查“具体冲突/利益开头”：有。
检查“一个可对号入座的客户场景”：有“手里钱备好了，房子也看了小半年……”。
检查“一个鲜明判断”：有“卡住大多数人的不是钱，是信息”。`

const CLEAN_BODY = `比市场价低两三成的房子，挂了两轮没人举牌。你以为是房子有问题？不是。是大家心里都清楚，便宜背后一定有代价。

法拍房这个市场，卡住大多数人的不是钱，是信息。你手里钱备好了，房子也看了小半年，好不容易碰到一套价格漂亮的，想拍又不敢拍。怕错过，更怕踩坑。

评论区扣“清单”，发你核对表，照着查一遍再决定交不交保证金。`

describe("detectSpokenChainOfThoughtLeakage（口播思维链泄漏检测）", () => {
  it("命中真实泄漏样本（强标记 + 弱标记行）", () => {
    const hits = detectSpokenChainOfThoughtLeakage(LEAKED_BODY)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((h) => h.includes("需要先判断"))).toBe(true)
    expect(hits.some((h) => h.startsWith("检查"))).toBe(true)
  })

  it("METHOD_NOTE 块内的判定文字不计入泄漏", () => {
    const hits = detectSpokenChainOfThoughtLeakage(`${METHOD_NOTE}\n\n${CLEAN_BODY}`)
    expect(hits).toEqual([])
    expect(isSpokenChainOfThoughtLeaked(`${METHOD_NOTE}\n\n${CLEAN_BODY}`)).toBe(false)
  })

  it("干净成稿不命中", () => {
    expect(detectSpokenChainOfThoughtLeakage(CLEAN_BODY)).toEqual([])
  })

  it("单个弱标记行不判定泄漏（避免误杀）", () => {
    const body = `${CLEAN_BODY}\n\n关于“结尾”的呼应：回到开头的信息差。`
    expect(detectSpokenChainOfThoughtLeakage(body)).toEqual([])
  })

  it("单个强标记行即判定泄漏", () => {
    const body = `${CLEAN_BODY}\n\n写正文草稿：\n${CLEAN_BODY}`
    expect(isSpokenChainOfThoughtLeaked(body)).toBe(true)
  })

  it("把口播时长和字数说明当作格式提示泄漏，而不是成稿正文", () => {
    const body = `3. 这是一份口播脚本（约2分钟，400-550字）。\n\n${CLEAN_BODY}`
    const hits = detectSpokenChainOfThoughtLeakage(body)
    expect(hits).toContain("3. 这是一份口播脚本（约2分钟，400-550字）。")
  })
})

describe("extractSpokenFinalDraft（末次成稿提取兜底）", () => {
  it("存在「写正文草稿：」分隔行时取其后正文，并保留 METHOD_NOTE", () => {
    const { draft, removedLines } = extractSpokenFinalDraft(`${METHOD_NOTE}\n\n${LEAKED_BODY}`)
    expect(draft.startsWith("[[AIM_METHOD_NOTE]]")).toBe(true)
    expect(draft).toContain("比市场价低两三成的房子")
    expect(draft).not.toContain("需要先判断")
    expect(draft).not.toContain("检查“具体冲突")
    expect(removedLines.some((l) => l.includes("任务单") || l.includes("需要先判断"))).toBe(true)
  })

  it("无分隔行时删除全部泄漏特征行", () => {
    const body = `${METHOD_NOTE}\n\n${CLEAN_BODY}\n\n检查“具体冲突/利益开头”：有。\n检查“一个鲜明判断”：有。`
    const { draft } = extractSpokenFinalDraft(body)
    expect(draft).toContain("比市场价低两三成的房子")
    expect(draft).not.toContain("检查")
  })

  it("分隔行后正文过短时回退到删行策略", () => {
    const body = `${CLEAN_BODY}\n\n写正文草稿：\n太短。`
    const { draft } = extractSpokenFinalDraft(body)
    expect(draft).toContain("比市场价低两三成的房子")
    expect(draft).not.toContain("写正文草稿")
  })
})

describe("isAimContinuationInput / formatAimContinuationDirective（续接指令展开）", () => {
  it("历史拼接后以「继续」收尾的 rawInput 被识别为续接", () => {
    expect(isAimContinuationInput("帮我写一条法拍房口播\n\n继续")).toBe(true)
    expect(isAimContinuationInput("继续。")).toBe(true)
    expect(isAimContinuationInput("接着写")).toBe(true)
  })

  it("带范围的续接（继续优化开头）与普通输入不识别为续接", () => {
    expect(isAimContinuationInput("继续优化这篇开头")).toBe(false)
    expect(isAimContinuationInput("帮我写一条口播")).toBe(false)
  })

  it("指令块包含正文纯净性约束", () => {
    const directive = formatAimContinuationDirective()
    expect(directive).toContain("【续接指令】")
    expect(directive).toContain("禁止")
    expect(directive).toContain("AIM_METHOD_NOTE")
  })
})

describe("buildWorkflowContext（续接指令注入）", () => {
  it("续接输入注入续接指令块", () => {
    const context = buildWorkflowContext({
      rawInput: "帮我写一条法拍房获客口播\n\n继续",
      runtimeTask: "new_copy",
      targetFormats: ["video_script"],
    })
    expect(context).toContain("【续接指令】")
    expect(context).toContain("直接输出完整成稿正文")
  })

  it("普通输入不注入续接指令块", () => {
    const context = buildWorkflowContext({
      rawInput: "帮我写一条法拍房获客口播",
      runtimeTask: "new_copy",
      targetFormats: ["video_script"],
    })
    expect(context).not.toContain("【续接指令】")
  })

  it("已显式确认意图时不注入（confirmedTurnIntent 优先）", () => {
    const context = buildWorkflowContext({
      rawInput: "帮我写一条法拍房获客口播\n\n继续",
      runtimeTask: "new_copy",
      targetFormats: ["video_script"],
      confirmedTurnIntent: {
        summary: "本轮意图：新建成稿",
        action: "create",
        scope: "full",
        deliverable: "口播脚本",
        keep: [],
        avoid: [],
        archiveGaps: [],
      },
    })
    expect(context).not.toContain("【续接指令】")
  })
})
