import { describe, expect, it } from "vitest"

import {
  BATCH_REPLICATE_MIN_SCRIPT_CHARS,
  BATCH_REPLICATE_MIN_SCRIPTS,
  isBatchReplicateCandidate,
} from "@/lib/aim/paste-copy-attachment"

/** 生成一条长度足够的文案（≥ BATCH_REPLICATE_MIN_SCRIPT_CHARS 字） */
function longScript(text = "这是一条足够长的对标文案用于测试批量复刻检测逻辑"): string {
  if (text.length >= BATCH_REPLICATE_MIN_SCRIPT_CHARS) return text
  return text.padEnd(BATCH_REPLICATE_MIN_SCRIPT_CHARS, "，补")
}

describe("isBatchReplicateCandidate", () => {
  it("2 条以上长文案 + 无排除关键词 → 命中", () => {
    const content = `${longScript("第一条对标文案讲的是新手妈妈夜间喂养的痛点")}\n\n---\n\n${longScript("第二条对标文案讲的是职场妈妈的通勤困境")}`
    expect(isBatchReplicateCandidate({ content, instruction: "" })).toBe(true)
  })

  it("1 条文案 → 不命中（少于最少条数）", () => {
    expect(isBatchReplicateCandidate({ content: longScript(), instruction: "" })).toBe(false)
  })

  it("空内容 → 不命中", () => {
    expect(isBatchReplicateCandidate({ content: "", instruction: "" })).toBe(false)
  })

  it("文案过短（< 50 字）→ 不命中", () => {
    const content = "短文案一\n\n---\n\n短文案二"
    expect(isBatchReplicateCandidate({ content, instruction: "" })).toBe(false)
  })

  it("指令含「修改这篇」→ 不命中（让位给 edit）", () => {
    const content = `${longScript()}\n\n---\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "帮我修改这篇文案" })).toBe(false)
  })

  it("指令含「润色这篇」→ 不命中", () => {
    const content = `${longScript()}\n\n---\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "润色这篇" })).toBe(false)
  })

  it("指令含「质检」→ 不命中（让位给 review）", () => {
    const content = `${longScript()}\n\n---\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "做一下质检" })).toBe(false)
  })

  it("指令含「复盘」→ 不命中（让位给 analytics）", () => {
    const content = `${longScript()}\n\n---\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "复盘这些数据" })).toBe(false)
  })

  it("指令含「记住风格」→ 不命中（让位给 style_sample）", () => {
    const content = `${longScript()}\n\n---\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "记住这种风格以后按这个写" })).toBe(false)
  })

  it("指令是批量复刻意图 → 命中", () => {
    const content = `${longScript()}\n\n---\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "批量复刻这批文案生成 5 条" })).toBe(true)
  })

  it("无指令裸粘贴多条 → 命中", () => {
    const content = `${longScript()}\n\n---\n\n${longScript()}\n\n---\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "" })).toBe(true)
  })

  it("双换行分隔（无 ---）也能命中", () => {
    const content = `${longScript()}\n\n${longScript()}`
    expect(isBatchReplicateCandidate({ content, instruction: "" })).toBe(true)
  })

  it("常量导出正确", () => {
    expect(BATCH_REPLICATE_MIN_SCRIPTS).toBe(2)
    expect(BATCH_REPLICATE_MIN_SCRIPT_CHARS).toBe(50)
  })
})
