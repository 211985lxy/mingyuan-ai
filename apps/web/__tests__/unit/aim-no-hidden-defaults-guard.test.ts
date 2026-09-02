import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import {
  AIM_HIGH_RISK_LOOP_RULE,
  FORMAT_INSTRUCTIONS,
  PUBLISH_PACKAGE_CHAT_RULE,
} from "@/lib/aim-agent-prompts"
import { buildBenchmarkLengthRule } from "@/lib/aim-benchmark-length"
import { AIM_IMITATE_REWRITE_SKILL_PROMPT } from "@/lib/aim-imitate-rewrite"
import { parseBatchReplicateCount } from "@/lib/aim/run-batch-replicate-send"
import { resolveCopyMethodologyPlan } from "@/lib/methodology/resolve-copy-methodology-plan"
import { resolveIpWikiLoadFlag } from "@/lib/aim-harness/context/load-generation-blocks"

/**
 * 「用户指令唯一真源」防回归绊线。
 *
 * 这些断言锁定 2026-09 整改后的行为契约：模板与链路里不得再出现未经用户确认的
 * 字数/数量/互动/CTA/内容目的硬门槛。若你真的需要为某个平台加回默认值，
 * 请先确认它已进入统一追问流程（由用户显式选择），再同步更新本文件——
 * 让这次修改成为一次有意识的决策，而不是悄悄回归。
 */

const source = (relative: string) =>
  readFileSync(join(process.cwd(), relative), "utf8")

describe("用户指令唯一真源：隐藏默认值禁止重现", () => {
  it("口播模板不得自带默认时长/字数门槛", () => {
    const instruction = FORMAT_INSTRUCTIONS.video_script
    expect(instruction).not.toMatch(/默认.{0,8}\d+\s*分钟/)
    expect(instruction).not.toMatch(/\d{3}\s*[-—到]\s*\d{3}\s*个?汉?字/)
    expect(instruction).toContain("不设默认时长、默认字数或交付门槛")
    expect(instruction).toContain("篇幅只服从用户明确要求")
  })

  it("平台模板不得包含硬字数下限、字数区间或强制互动/CTA", () => {
    expect(FORMAT_INSTRUCTIONS.wechat_article).not.toMatch(/至少\s*\d+\s*字/)
    expect(FORMAT_INSTRUCTIONS.moments_post).not.toMatch(/\d+\s*[-—到]\s*\d+\s*字/)
    expect(FORMAT_INSTRUCTIONS.moments_post).not.toContain("最后一句引导互动")
    expect(FORMAT_INSTRUCTIONS.community_message).not.toMatch(/\d+\s*[-—到]\s*\d+\s*字/)
    expect(FORMAT_INSTRUCTIONS.community_message).not.toContain("必须有一个轻量互动动作")
    expect(FORMAT_INSTRUCTIONS.raw_copy).not.toMatch(/\d+\s*[-—到]\s*\d+\s*字/)
    expect(FORMAT_INSTRUCTIONS.shooting_brief).not.toMatch(/必拍镜头至少|至少给\s*\d+\s*条/)
  })

  it("发布包规则不得固定话题数量或行数", () => {
    expect(PUBLISH_PACKAGE_CHAT_RULE).not.toMatch(/默认输出\s*\d+\s*个/)
    expect(PUBLISH_PACKAGE_CHAT_RULE).not.toMatch(/推荐\s*\d+\s*个/)
    expect(PUBLISH_PACKAGE_CHAT_RULE).not.toMatch(/默认控制在\s*\d+[-—到]\d+\s*行/)
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("发布话题数量只服从用户明确要求")
  })

  it("验证结果/质检说明不得写回可发布正文", () => {
    expect(AIM_HIGH_RISK_LOOP_RULE).not.toContain("结尾追加一个简短“验证结果”区块")
    expect(AIM_HIGH_RISK_LOOP_RULE).toContain("验证结论绝不进正文")
  })

  it("对标改写不得自动对齐原文长度；批量/仿写不得有隐藏数量", () => {
    expect(buildBenchmarkLengthRule("对标正文。".repeat(200))).toBeNull()
    expect(parseBatchReplicateCount("批量复刻这些对标文案")).toBeNull()
    expect(parseBatchReplicateCount("批量复刻这些对标文案，生成 5 条")).toBe(5)
    expect(source("src/lib/aim/run-batch-replicate-send.ts")).not.toContain("const count = 3")
    expect(AIM_IMITATE_REWRITE_SKILL_PROMPT).toContain("不默认翻倍成双版本")
  })

  it("发布计划与创作台指令不得固定排产数量或默认内容目的", () => {
    const guides = source("src/lib/aim-agent-guides.ts")
    expect(guides).not.toContain("12 条内容排产表")
    expect(guides).not.toContain("未说明时默认按流量漏斗处理")
  })

  it("方法论不得在无目标词时默认获客；IP Wiki 不得无条件自动加载", () => {
    const plan = resolveCopyMethodologyPlan({ rawInput: "写一条文案", mode: "generate" })
    expect(plan.businessGoal).not.toBe("lead")
    expect(plan.cardIds).not.toContain("card.lead_gen")
    expect(resolveIpWikiLoadFlag({
      projectId: "proj-1",
      rawInput: "写一篇获客口播",
      useKnowledge: false,
      runtimeTask: "new_copy",
    })).toBe(false)
  })

  it("口播模块不得存在任何字数验收机制（源码扫描）", () => {
    const spokenLength = source("src/lib/aim-spoken-length.ts")
    // 字数/时长只进提示词由模型照办；代码侧不得有验收边界、超长判定或静默裁剪
    expect(spokenLength).not.toContain("requestedSpokenLengthBounds")
    expect(spokenLength).not.toContain("findOverlongGenerationFormats")
    expect(spokenLength).not.toContain("fitOverlongSpokenContent")
    expect(spokenLength).not.toContain("countSpokenCharacters")
    expect(spokenLength).toContain("字数/时长永远不做代码级口径")
  })
})
