import { describe, expect, it } from "vitest"

import {
  parseExplicitDirectModeCommand,
  parseExplicitPlanModeCommand,
} from "@/lib/aim/plan-mode-command"

describe("计划模式显式指令", () => {
  it.each([
    ["进入计划模式", ""],
    ["请先开启计划模式，帮我写一条获客文案", "帮我写一条获客文案"],
    ["先别直接写，先梳理需求一下", ""],
    ["先问我几个问题，再帮我写一条短视频文案", "一条短视频文案"],
    ["先确认需求，然后生成朋友圈文案", "朋友圈文案"],
  ])("明确指令才进入计划模式：%s", (input, remainingInput) => {
    expect(parseExplicitPlanModeCommand(input)).toEqual({ matched: true, remainingInput })
  })

  it.each([
    "写一个年度计划",
    "帮我做内容规划",
    "这个方案怎么表达",
    "计划模式怎么用",
    "信息不够也直接写一版",
  ])("普通内容不触发计划模式：%s", (input) => {
    expect(parseExplicitPlanModeCommand(input).matched).toBe(false)
  })

  it.each([
    ["退出计划模式", ""],
    ["不用规划了，直接写一条朋友圈", "写一条朋友圈"],
    ["直接生成一条口播文案", "一条口播文案"],
    ["先出一版短视频文案", "短视频文案"],
  ])("明确指令退出计划模式：%s", (input, remainingInput) => {
    expect(parseExplicitDirectModeCommand(input)).toEqual({ matched: true, remainingInput })
  })
})
