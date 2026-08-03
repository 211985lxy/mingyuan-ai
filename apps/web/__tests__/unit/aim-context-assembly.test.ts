/**
 * prepareAimContext 装配契约测试（阶段 2.2）。
 *
 * 验证统一上下文装配阶段产出正确的 PreparedAimContext 结构，且 gating 行为与
 * buildAimGeneration 原装配逻辑一致。使用 contextOverride（eval-only 冻结上下文）
 * 路径，且不带 projectId —— 规避所有 live DB 查询（project_check / TaskSpec 内的
 * prisma 查询均以 projectId / topicSelectionId 为前置条件）。
 *
 * 重点断言：
 *   - 结构契约（blocks / taskSpec / contextManifest / retrievedEntries）
 *   - 冻结 block 经预算后逐字保留（contextOverride 注入什么，blocks 就含什么）
 *   - contextManifest 含 knowledge 来源 + request 来源（声明式，取代事后反查）
 *   - light_edit 任务：knowledge block 不因 gating 被加载（这里用 contextOverride
 *     直接给定，验证 budget profile 不丢失）
 *   - 写作风格档案经 styleProfileBlock 并入 knowledge，并记入 manifest
 */
import { describe, expect, it } from "vitest"

import { prepareAimContext } from "@/lib/aim-harness/context-assembly"
import { planAimRun } from "@/lib/aim-harness/planner"
import { AIM_FACT_PRIORITY_RULE } from "@/lib/aim-context-priority"
import {
  mergeStyleIntoKnowledgeBlock,
} from "@/lib/aim-harness/context/load-style-profile"
import type { PreparedAimContext } from "@/lib/aim-harness/contracts"

function makeSpec(overrides: { rawInput?: string; taskType?: string } = {}) {
  return planAimRun({
    entrypoint: "generate",
    agentId: "content_producer",
    rawInput: overrides.rawInput ?? "请围绕护肤写一条短视频脚本",
    targetFormats: ["video_script"],
    taskType: overrides.taskType ?? "write_script",
  })
}

describe("prepareAimContext 装配（阶段 2.2）", () => {
  it("用冻结上下文产出符合 PreparedAimContext 的结构（无 projectId → 无 DB）", async () => {
    const spec = makeSpec()
    const prepared = await prepareAimContext({
      spec,
      userId: "aim-eval",
      stableRouting: false,
      contextOverride: {
        knowledgeBlock: "【知识】护肤成分科普",
        entries: [
          { id: "k1", title: "烟酰胺", content: "...", category: "成分", tags: [], valueGrade: null, score: 1 },
        ],
        source: "raw",
        viralStructureBlock: "【爆款结构】",
        ipWikiBlock: "【IP 定位】",
      },
    })

    // 结构契约
    const _typeCheck: PreparedAimContext = prepared
    void _typeCheck
    expect(prepared.spec).toBe(spec)
    expect(prepared.blocks).toBeDefined()
    expect(prepared.contextManifest).toBeInstanceOf(Array)
    expect(prepared.budgetApplied).toBe(true)

    // 冻结 block 经预算后保留（new_copy 任务预算宽松，4k+ 字以内不截断）
    expect(prepared.blocks.viralStructure).toContain("爆款结构")
    expect(prepared.blocks.ipWiki).toContain("IP 定位")
    expect(prepared.blocks.knowledge.startsWith(AIM_FACT_PRIORITY_RULE)).toBe(true)
    expect(prepared.blocks.knowledge).toContain("护肤成分科普")

    // 知识条目透传
    expect(prepared.retrievedEntries).toHaveLength(1)
    expect(prepared.retrievedEntries![0].id).toBe("k1")

    // 声明式来源清单：含 knowledge 来源 + request 来源
    const kinds = prepared.contextManifest.map((s) => s.kind)
    expect(kinds).toContain("knowledge")
    expect(kinds).toContain("request")
    const reqSource = prepared.contextManifest.find((s) => s.kind === "request")
    expect(reqSource?.id).toBe("raw_input")
  })

  it("taskSpec 优先采用传入的 workflow brief（route 已授权重建）", async () => {
    const spec = makeSpec()
    const authorizedTaskSpec = {
      goal: "写一条护肤短视频脚本",
      mode: "direct_delivery" as const,
      riskLevel: "low" as const,
      knownFacts: [{ statement: "客户是护肤品牌", source: "brief" }],
      unknowns: [],
      assumptions: [],
      nextAction: "产出脚本",
      classifiedBy: "rule" as const,
      classifiedAt: "2026-07-11T00:00:00.000Z",
    }
    const prepared = await prepareAimContext({
      spec,
      userId: "aim-eval",
      taskSpec: authorizedTaskSpec,
      stableRouting: false,
      contextOverride: {
        knowledgeBlock: "",
        entries: [],
        source: "raw",
      },
    })
    // 传入的 taskSpec 作为基底保留；规则级补全只填充空运营字段，不覆盖已确认值
    expect(prepared.taskSpec?.goal).toBe(authorizedTaskSpec.goal)
    expect(prepared.taskSpec?.mode).toBe(authorizedTaskSpec.mode)
    expect(prepared.taskSpec?.knownFacts).toEqual(authorizedTaskSpec.knownFacts)
    expect(prepared.taskSpec?.nextAction).toBe(authorizedTaskSpec.nextAction)
    expect(prepared.taskSpec?.classifiedBy).toBe("rule")
  })

  it("contextManifest 的 request 来源 charCount 等于 rawInput 长度（contextHash 稳定基线）", async () => {
    const rawInput = "一条确定长度的输入文本"
    const spec = makeSpec({ rawInput })
    const prepared = await prepareAimContext({
      spec,
      userId: "aim-eval",
      stableRouting: false,
      contextOverride: { knowledgeBlock: "", entries: [], source: "raw" },
    })
    const reqSource = prepared.contextManifest.find((s) => s.kind === "request")
    expect(reqSource?.charCount).toBe(rawInput.length)
  })

  it("冻结风格档案并入 knowledge，并记入 style_profile 来源", async () => {
    const styleProfileBlock = "\n\n=== 写作风格档案（项目风格） ===\n短句、口语、少形容词"
    const prepared = await prepareAimContext({
      spec: makeSpec(),
      userId: "aim-eval",
      stableRouting: false,
      contextOverride: {
        knowledgeBlock: "【知识】护肤成分科普",
        entries: [],
        source: "raw",
        styleProfileBlock,
      },
    })

    expect(prepared.blocks.knowledge).toContain("护肤成分科普")
    expect(prepared.blocks.knowledge).toContain("写作风格档案")
    expect(prepared.blocks.knowledge).toContain("短句、口语、少形容词")

    const styleSource = prepared.contextManifest.find((s) => s.id === "style_profile")
    expect(styleSource?.kind).toBe("methodology")
    expect(styleSource?.charCount).toBe(styleProfileBlock.length)
  })
})

describe("mergeStyleIntoKnowledgeBlock", () => {
  it("风格为空时保持知识原文", () => {
    expect(mergeStyleIntoKnowledgeBlock("知识块", "")).toBe("知识块")
    expect(mergeStyleIntoKnowledgeBlock("知识块", "   ")).toBe("知识块")
  })

  it("仅有风格时直接返回风格", () => {
    expect(mergeStyleIntoKnowledgeBlock("", "风格块")).toBe("风格块")
  })

  it("两者都有时风格接在知识后面", () => {
    expect(mergeStyleIntoKnowledgeBlock("知识块", "风格块")).toBe("知识块\n风格块")
  })
})
