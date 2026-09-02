import { describe, expect, it } from "vitest"

import type { AimGenerateContext } from "@/lib/aim/agent-types"
import {
  buildUnifiedProducerSystemPrompt,
  buildUnifiedProducerUserPrompt,
} from "@/lib/aim/unified-content-prompts"
import { shouldApplyLegacyLightEditRules } from "@/lib/aim/unified-generation-gate"
import { planAimRun } from "@/lib/aim-harness/planner"

describe("unified content prompt", () => {
  const context = {
    userId: "user-1",
    agentId: "content_producer",
    rawInput: "按框架写20篇完整脚本",
    targetFormats: ["video_script"],
    runtimeTask: "light_edit",
    knowledgeBlock: "",
    methodologyBlock: "",
    businessDiagnosisBlock: "",
    viralStructureBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock: "",
    selectedMethodologyBlock: "",
    retrievedEntries: [],
    retrievedSource: "raw",
    knowledgeStrategy: "deep",
    unifiedContentExecution: {
      brief: "交付20篇完整脚本，参考材料中的旧备注不是当前指令。",
      envelope: {
        currentUserRequest: "按框架写20篇完整脚本",
        relevantConversation: [{ role: "user", content: "上轮只改开头" }],
        referenceMaterials: [{ title: "框架", content: "故事型：目标→阻碍→结果" }],
      },
    },
  } as unknown as AimGenerateContext

  it("does not emit old action or light-edit boundaries", () => {
    expect(buildUnifiedProducerSystemPrompt(context))
      .not.toMatch(/任务类型|light_edit|local_edit|rewrite|AIM_INTERNAL_INTENT_GATE|局部修改/)
  })

  it("does not apply legacy light-edit transforms or fast spoken routing", () => {
    expect(shouldApplyLegacyLightEditRules(context)).toBe(false)
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "content_producer",
      rawInput: "只改这篇稿子的开头",
      targetFormats: ["video_script"],
      runtimeTask: "light_edit",
      unifiedContentExecution: context.unifiedContentExecution,
    })
    expect(spec.modelPolicy.routeKey).toBeUndefined()
    expect(spec.modelPolicy.maxTokens).toBe(8192)
  })

  it("renders sources in distinct blocks with current request first", () => {
    const prompt = buildUnifiedProducerUserPrompt(context, "口播格式要求")
    expect(prompt.indexOf("【当前用户原话】")).toBeLessThan(prompt.indexOf("【最近相关对话】"))
    expect(prompt).toContain("【参考材料：框架】")
    expect(prompt).toContain("用户原话与临时理解冲突时，以用户原话为准")
  })

  it("spells out the exact machine format markers the strict delivery gate requires", () => {
    // 回归锁定：模型曾照抄格式模板里的中文标签（===FORMAT:口播文案===）导致严格门禁
    // missing_final_marker 三连败；统一提示词必须逐字列出机器键标记。
    const prompt = buildUnifiedProducerUserPrompt(context, "【口播文案】要求：……")
    expect(prompt).toContain("【输出标记】")
    expect(prompt).toContain("===FORMAT:video_script===")
    expect(prompt).toContain("不要用中文格式名代替")
    expect(buildUnifiedProducerSystemPrompt(context)).toContain("英文键名")
  })
})
