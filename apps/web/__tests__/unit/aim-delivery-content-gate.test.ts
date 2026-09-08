import { describe, expect, it } from "vitest"

import {
  AimDeliveryContentError,
  applyDeliveryContentGate,
  inspectDeliveryContent,
} from "@/lib/aim/delivery-content-gate"
import { sanitizeReasoningSummary } from "@/lib/aim-generation-text"
import type { ResolvedUserIntent } from "@/lib/aim/resolved-user-intent"

const unsetIntent: ResolvedUserIntent = {
  taskKind: "new_draft",
  taskObject: "写口播",
  lengthPolicy: "unset",
  isNewTask: true,
  constraintSources: {},
}

const CLEAN = `比市场价低两三成的房子，挂了两轮没人举牌。你以为是房子有问题？不是。是大家心里都清楚，便宜背后一定有代价。

法拍房这个市场，卡住大多数人的不是钱，是信息。你手里钱备好了，房子也看了小半年，好不容易碰到一套价格漂亮的，想拍又不敢拍。怕错过，更怕踩坑。

评论区扣“清单”，发你核对表，照着查一遍再决定交不交保证金。`

describe("inspectDeliveryContent", () => {
  it("rejects spoken chain-of-thought samples", () => {
    const leaked = `需要先判断一下当前的情况。用户说“继续”。
写正文草稿：
${CLEAN}
检查“具体冲突/利益开头”：有。`
    const result = inspectDeliveryContent({ format: "video_script", content: leaked, intent: unsetIntent })
    expect(result.passed).toBe(false)
    if (!result.passed) {
      expect(result.violations).toContain("reasoning_leak")
      expect(result.leakedLines.some((line) => line.includes("需要先判断"))).toBe(true)
      expect(result.leakedLines.some((line) => line.includes("用户说"))).toBe(true)
      expect(result.leakedLines.some((line) => line.includes("写正文草稿"))).toBe(true)
      expect(result.leakedLines.some((line) => line.startsWith("检查"))).toBe(true)
    }
  })

  it("rejects invented duration labels when the user did not specify length", () => {
    const result = inspectDeliveryContent({
      format: "video_script",
      content: `3. 这是一份口播脚本（约2分钟，400-550字）。\n\n${CLEAN}`,
      intent: unsetIntent,
    })
    expect(result.passed).toBe(false)
    if (!result.passed) {
      expect(result.violations).toContain("invented_length")
      expect(result.leakedLines).toContain("3. 这是一份口播脚本（约2分钟，400-550字）。")
    }
  })

  it("keeps user-requested length and real numbers in the material", () => {
    const intent: ResolvedUserIntent = {
      ...unsetIntent,
      lengthPolicy: "user_explicit",
      lengthText: "2分钟、400-550字",
    }
    expect(inspectDeliveryContent({
      format: "video_script",
      content: `按你的要求写2分钟、400-550字。\n\n${CLEAN}`,
      intent,
    }).passed).toBe(true)
    expect(inspectDeliveryContent({
      format: "wechat_article",
      content: "我们帮某店60天产出40条内容，线索从800元降到210元。",
      intent: unsetIntent,
    }).passed).toBe(true)
  })

  it("does not treat a reference draft's duration label as a current instruction", () => {
    expect(inspectDeliveryContent({
      format: "video_script",
      content: `3. 这是一份口播脚本（约2分钟，400-550字）。\n\n${CLEAN}`,
      intent: { ...unsetIntent, lengthPolicy: "material_derived" },
    }).passed).toBe(false)
  })

  it("rejects task analysis in non-spoken formats", () => {
    for (const format of ["wechat_article", "moments_post", "raw_copy"] as const) {
      const result = inspectDeliveryContent({
        format,
        content: "好的老板，我先把这轮任务在内部复述一遍。\n最终决定：写一篇公众号。\n真正正文从这里开始。",
        intent: unsetIntent,
      })
      expect(result.passed, format).toBe(false)
    }
  })
})

describe("applyDeliveryContentGate", () => {
  it("retries with violations then extracts or throws on the last attempt", () => {
    const first = applyDeliveryContentGate({
      parsed: { video_script: `需要先判断一下。\n写正文草稿：\n太短` },
      targetFormats: ["video_script"],
      intent: unsetIntent,
      attempt: 0,
      maxAttempts: 3,
      originalPrompt: "写口播",
    })
    expect(first.ok).toBe(false)
    if (!first.ok) expect(first.retryPrompt).toContain("需要先判断")

    const parsed = { video_script: `需要先判断一下。\n写正文草稿：\n${CLEAN}` }
    const last = applyDeliveryContentGate({
      parsed,
      targetFormats: ["video_script"],
      intent: unsetIntent,
      attempt: 2,
      maxAttempts: 3,
      originalPrompt: "写口播",
    })
    expect(last.ok).toBe(true)
    expect(parsed.video_script).toContain("比市场价低两三成")
    expect(parsed.video_script).not.toContain("需要先判断")

    expect(() => applyDeliveryContentGate({
      parsed: { video_script: "需要先判断一下。写正文草稿：太短" },
      targetFormats: ["video_script"],
      intent: unsetIntent,
      attempt: 2,
      maxAttempts: 3,
      originalPrompt: "写口播",
    })).toThrow(AimDeliveryContentError)
  })
})

describe("sanitizeReasoningSummary", () => {
  it("keeps high-level rationale and drops first-person drafts", () => {
    const cleaned = sanitizeReasoningSummary(`目标：帮实体店老板获客
我先逐步推演一下结构
写正文草稿：先痛点后方法
假设：读者还没做过内容获客
风险：数字未经核实`)
    expect(cleaned).toContain("目标")
    expect(cleaned).toContain("假设")
    expect(cleaned).toContain("风险")
    expect(cleaned).not.toContain("逐步推演")
    expect(cleaned).not.toContain("写正文草稿")
  })
})
