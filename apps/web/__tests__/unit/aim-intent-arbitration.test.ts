import { describe, expect, it } from "vitest"

import { parseSemanticTaskUnderstanding } from "@/lib/aim/semantic-task-understanding"
import { resolveExecuteTurnGate } from "@/lib/aim/execute-turn-intent-gate"
import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"

function envelopeOf(request: string, extra?: Partial<AimContentSourceEnvelope>): AimContentSourceEnvelope {
  return { currentUserRequest: request, relevantConversation: [], referenceMaterials: [], ...extra }
}

function llmOutput(input: {
  handling?: string
  intent?: unknown
  brief?: string
}): string {
  return [
    `[[AIM_HANDLING:${input.handling ?? "deliver"}]]`,
    `[[AIM_TASK_BRIEF]]${input.brief ?? "按用户要求写稿"}[[/AIM_TASK_BRIEF]]`,
    input.intent !== undefined
      ? `[[AIM_INTENT_JSON]]${typeof input.intent === "string" ? input.intent : JSON.stringify(input.intent)}[[/AIM_INTENT_JSON]]`
      : "",
  ].filter(Boolean).join("\n")
}

describe("语义理解协议 v2：[[AIM_INTENT_JSON]] 解析", () => {
  it("合法 JSON 块解析为结构化意图", () => {
    const parsed = parseSemanticTaskUnderstanding(llmOutput({
      intent: { taskKind: "benchmark_rewrite", goal: "traffic", confidence: 0.9, isNewTask: true },
    }))
    expect(parsed.intent).toMatchObject({
      taskKind: "benchmark_rewrite",
      goal: "traffic",
      isNewTask: true,
      confidence: 0.9,
    })
  })

  it("坏 JSON / 越界枚举 / 空块：整块忽略，回退规则意图（不抛错）", () => {
    expect(parseSemanticTaskUnderstanding(llmOutput({ intent: "{not-json" })).intent).toBeUndefined()
    expect(parseSemanticTaskUnderstanding(llmOutput({
      intent: { taskKind: "做什么都行", goal: "money" },
    })).intent).toBeUndefined()
    expect(parseSemanticTaskUnderstanding(llmOutput({ intent: "  " })).intent).toBeUndefined()
  })

  it("v1 输出（无 JSON 块）不受影响", () => {
    const parsed = parseSemanticTaskUnderstanding(llmOutput({}))
    expect(parsed.handling).toBe("deliver")
    expect(parsed.intent).toBeUndefined()
  })

  it("字段级校验：合法字段保留、非法字段丢弃", () => {
    const parsed = parseSemanticTaskUnderstanding(llmOutput({
      intent: { taskKind: "polish_existing", audience: "实体店老板", topic: 123, confidence: 1.7 },
    }))
    expect(parsed.intent?.taskKind).toBe("polish_existing")
    expect(parsed.intent?.audience).toBe("实体店老板")
    expect(parsed.intent?.topic).toBeUndefined()
    expect(parsed.intent?.confidence).toBe(1)
  })
})

describe("意图仲裁：LLM 为权威、规则补位、分歧可观测", () => {
  it("LLM 高置信覆盖规则 taskKind，冲突被记录", () => {
    // 规则判 new_draft（素材标题无对标词、指令无对标动词、正文无结构标记——
    // 规则真判不出的场景），LLM 读懂材料性质判 benchmark_rewrite
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf("就照这个感觉再来一篇", {
        referenceMaterials: [{ title: "参考资料", content: "为什么穷人越忙越穷？因为…" }],
      }),
      handling: "deliver",
      llmIntent: { taskKind: "benchmark_rewrite", confidence: 0.85 },
    })
    expect(gate.intent.taskKind).toBe("benchmark_rewrite")
    expect(gate.intentProvenance?.ruleTaskKind).toBe("new_draft")
    expect(gate.intentProvenance?.conflicts).toContain("taskKind: new_draft→benchmark_rewrite")
  })

  it("低置信（<0.7）不覆盖规则判定", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf("帮我写一条口播文案"),
      handling: "deliver",
      llmIntent: { taskKind: "benchmark_rewrite", confidence: 0.5 },
    })
    expect(gate.intent.taskKind).toBe("new_draft")
    expect(gate.intentProvenance?.finalTaskKind).toBe("new_draft")
  })

  it("LLM 识别出规则漏掉的受众：补位并标记来源", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf("写一篇讲不良资产的文章"),
      handling: "deliver",
      llmIntent: { audience: "想入行不良资产的新人", confidence: 0.8 },
    })
    expect(gate.intent.audience).toBe("想入行不良资产的新人")
    expect(gate.intent.constraintSources.audience).toBe("user_current")
  })

  it("无 llmIntent（快径/降级）：纯规则仲裁，行为与之前一致", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf("帮我写一条口播文案"),
      handling: "deliver",
    })
    expect(gate.intent.taskKind).toBe("new_draft")
    expect(gate.intentProvenance).toBeUndefined()
  })

  it("LLM 判 answer_question 与 handling=respond 一致时走回答语义", () => {
    const gate = resolveExecuteTurnGate({
      envelope: envelopeOf("这篇文案的结构是什么类型？为什么这么写？"),
      handling: "respond",
      llmIntent: { taskKind: "answer_question", confidence: 0.9 },
    })
    expect(gate.intent.taskKind).toBe("answer_question")
    expect(gate.clarification).toBeNull()
  })
})
