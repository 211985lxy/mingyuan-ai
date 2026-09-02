import { describe, expect, it } from "vitest"

import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import {
  AIM_CLARIFICATION_LEAD,
  buildNumberedClarification,
  collectIntentClarificationGaps,
  isClarificationAnswerTurn,
  mergeClarificationQuestions,
  resolveUserIntentFromEnvelope,
} from "@/lib/aim/resolved-user-intent"

function envelope(input: {
  request: string
  conversation?: Array<{ role: "user" | "assistant"; content: string }>
  materials?: Array<{ title: string; content: string }>
  currentArtifact?: string
}): AimContentSourceEnvelope {
  return {
    currentUserRequest: input.request,
    relevantConversation: input.conversation ?? [],
    currentArtifact: input.currentArtifact ? { format: "video_script", content: input.currentArtifact } : undefined,
    referenceMaterials: input.materials ?? [],
  }
}

describe("resolveUserIntentFromEnvelope", () => {
  it("resolves a generic new draft with no key fields confirmed", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({ request: "帮我写个文案" }))
    expect(intent.taskKind).toBe("new_draft")
    expect(intent.isNewTask).toBe(true)
    expect(intent.lengthPolicy).toBe("unset")
    expect(intent.goal).toBeUndefined()
  })

  it("marks explicit audience, goal and length as user_current", () => {
    const intent = resolveUserIntentFromEnvelope(
      envelope({ request: "写一条1分钟口播，面向实体店老板，目标是引流获客" }),
    )
    expect(intent.audience).toBeTruthy()
    expect(intent.goal).toBe("lead")
    expect(intent.lengthPolicy).toBe("user_explicit")
    expect(intent.constraintSources.goal).toBe("user_current")
    expect(intent.constraintSources.length).toBe("user_current")
  })

  it("treats a clarification answer as task-confirmed length (2分钟、400-550字)", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "1分钟太短了，改成2分钟，400到550字",
      conversation: [
        { role: "assistant", content: `${AIM_CLARIFICATION_LEAD} 1 件事…` },
      ],
    }))
    expect(intent.lengthPolicy).toBe("user_explicit")
    expect(isClarificationAnswerTurn(envelope({
      request: "2分钟，450字左右",
      conversation: [
        { role: "user", content: "写一条口播" },
        { role: "assistant", content: `${AIM_CLARIFICATION_LEAD} 1 件事（直接按编号回答即可）：\n1. 篇幅要多长？` },
      ],
    }))).toBe(true)
  })

  it("detects polish_existing and derives length from a complete original draft (894字场景)", () => {
    const original = "这是一篇完整的原始稿件。".repeat(60)
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "请优化修改，直接给可发布终稿",
      materials: [{ title: "用户参考原文", content: original }],
    }))
    expect(intent.taskKind).toBe("polish_existing")
    // 用户说"直接给可发布终稿"= 整篇精修：修改范围明确，不再追问
    expect(intent.modificationScope).toBeTruthy()
    expect(intent.lengthPolicy).toBe("material_derived")
    expect(collectIntentClarificationGaps(intent)).toEqual([])
  })

  it("asks about modification scope when a polish request does not say which part", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "帮我改一下",
      currentArtifact: "这是一段已经写好的当前稿内容，长度足够作为完整原稿使用。".repeat(6),
    }))
    expect(intent.taskKind).toBe("polish_existing")
    const gaps = collectIntentClarificationGaps(intent)
    expect(gaps.map((gap) => gap.field)).toEqual(["modificationScope"])
  })

  it("never asks about length on benchmark rewrite; length rides on the user's own words", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "按对标原文重新写一版",
      materials: [{ title: "对标原文", content: "对标爆款正文。".repeat(40) }],
    }))
    expect(intent.taskKind).toBe("benchmark_rewrite")
    expect(collectIntentClarificationGaps(intent)).toEqual([])
  })

  it("keeps user keep-original volume choice and skips the length question", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "按对标原文重新写一版，保持原体量别改短",
      materials: [{ title: "对标原文", content: "对标爆款正文。".repeat(40) }],
    }))
    expect(intent.lengthPolicy).toBe("keep_original")
    expect(collectIntentClarificationGaps(intent)).toEqual([])
  })

  it("asks for quantity on batch replicate when count is missing", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "批量复刻这些对标文案",
      materials: [{ title: "对标原文", content: "样本。".repeat(60) }],
    }))
    expect(intent.taskKind).toBe("batch_replicate")
    expect(intent.quantity).toBeUndefined()
    expect(collectIntentClarificationGaps(intent).map((gap) => gap.field)).toEqual(["quantity"])

    const withCount = resolveUserIntentFromEnvelope(envelope({
      request: "批量复刻这些对标文案，生成5条",
      materials: [{ title: "对标原文", content: "样本。".repeat(60) }],
    }))
    expect(withCount.quantity).toBe(5)
    expect(collectIntentClarificationGaps(withCount)).toEqual([])
  })

  it("asks new-draft gaps without ever asking about length", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({ request: "帮我写个文案" }))
    const gaps = collectIntentClarificationGaps(intent)
    // 篇幅不是缺口：字数只随用户原话，不追问
    expect(gaps.map((gap) => gap.field)).toEqual(["topic", "goal"])
    const text = buildNumberedClarification(gaps)
    expect(text).toContain(`${AIM_CLARIFICATION_LEAD} 2 件事`)
    expect(text).toContain("1. ")
    expect(text).toContain("2. ")
    expect(text).not.toContain("3. ")
    expect(text).not.toMatch(/篇幅|多长|字数/)
  })

  it("does not ask CTA for a plain new draft without a lead/convert goal", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "写一篇讲AI提效的文章，写给中小企业老板，2000字",
    }))
    const gaps = collectIntentClarificationGaps(intent)
    expect(gaps.some((gap) => /CTA|行动引导/.test(gap.question))).toBe(false)
  })

  it("keeps a follow-up reference (继续改这篇) out of new-task isolation", () => {
    const intent = resolveUserIntentFromEnvelope(envelope({
      request: "继续改这篇，把结尾承接再收紧一点",
      currentArtifact: "当前编辑器里的成稿正文，长度足够。".repeat(10),
    }))
    expect(intent.isNewTask).toBe(false)
    expect(intent.taskObject).toBe("当前作品")

    const switched = resolveUserIntentFromEnvelope(envelope({
      request: "换个主题，写一篇讲私域成交的朋友圈",
      conversation: [{ role: "assistant", content: "上一篇口播已交付。" }],
    }))
    expect(switched.isNewTask).toBe(true)
  })

  it("merges LLM questions with deterministic gaps, dedupes by field and caps at 3", () => {
    const merged = mergeClarificationQuestions(
      ["这篇要写给谁看？", "是新任务还是继续改上一篇？"],
      [
        { field: "audience", question: "主要给谁看？" },
        { field: "goal", question: "内容目标是什么？" },
        { field: "length", question: "篇幅要多长？" },
      ],
    )
    expect(merged.length).toBe(3)
    expect(merged.some((gap) => gap.field === "audience")).toBe(true)
    // LLM 的问题优先保留，确定性缺口按字段去重后补位
    expect(merged[0].question).toContain("写给谁")
    expect(merged.some((gap) => gap.field === "taskBoundary")).toBe(true)
  })
})
