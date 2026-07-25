import { describe, expect, it } from "vitest"

import {
  resolveAimTurnIntent,
  formatAimTurnIntentBlock,
  assessArchiveGaps,
  applyTurnIntentEdits,
  shouldConfirmTurnIntent,
  normalizeConfirmedTurnIntent,
} from "@/lib/aim-turn-intent"
import { buildWorkflowContext } from "@/lib/aim-generation-prompts"
import { isStableRoutingEnabled } from "@/lib/aim-stable-routing"

describe("AimTurnIntent（意图优先）", () => {
  it("优化开头 → local_edit + opening，摘要点名保留正文", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "只优化这篇开头，不要改正文",
      runtimeTask: "light_edit",
    })
    expect(intent.action).toBe("local_edit")
    expect(intent.scope).toBe("opening")
    expect(intent.summary).toContain("局部修改")
    expect(intent.avoid.some((a) => a.includes("整篇"))).toBe(true)
  })

  it("小红书种草 → create + 交付物小红书", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "帮我写一篇小红书种草文",
      targetFormats: ["xiaohongshu_post"],
    })
    expect(intent.action).toBe("create")
    expect(intent.deliverable).toContain("小红书")
  })

  it("人设词+种草仍判 create，不走人设梳理", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "结合人设写一篇小红书种草文",
    })
    expect(intent.action).toBe("create")
    expect(intent.action).not.toBe("position")
  })

  it("这个文案结构是什么 → chat，禁止擅自整篇成稿", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "这个文案结构是什么",
      targetFormats: ["video_script"],
      runtimeTask: "new_copy",
    })
    expect(intent.action).toBe("chat")
    expect(intent.avoid.some((a) => a.includes("擅自输出整篇成稿"))).toBe(true)
    expect(intent.summary).toContain("结构")
  })

  it("优化这段话（含粘贴原文）→ local_edit，禁止扩成长口播", () => {
    const intent = resolveAimTurnIntent({
      rawInput: [
        "养了一个内容团队，配了策划、文案、拍摄、剪辑，每个月工资场地设备往里砸。",
        "",
        "优化这段话",
      ].join("\n"),
      targetFormats: ["video_script"],
      runtimeTask: "new_copy",
    })
    expect(intent.action).toBe("local_edit")
    expect(intent.avoid.some((a) => a.includes("扩写成全新长口播"))).toBe(true)
    expect(intent.summary).toContain("润色")
  })

  it("这段帮我改顺一点 / 写短 / 太啰嗦 → local_edit，禁止新建长稿", () => {
    for (const rawInput of ["这段帮我改顺一点", "把这段写短一点", "这段太啰嗦了"]) {
      const intent = resolveAimTurnIntent({
        rawInput,
        targetFormats: ["video_script"],
        runtimeTask: "new_copy",
      })
      expect(intent.action).toBe("local_edit")
      expect(intent.avoid.some((a) => a.includes("扩写成全新长口播"))).toBe(true)
    }
  })

  it("帮我润色下（无指代短指令）→ local_edit", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "帮我润色下",
      targetFormats: ["video_script"],
      runtimeTask: "new_copy",
    })
    expect(intent.action).toBe("local_edit")
  })

  it("点评一下这篇 → chat，禁止擅自整篇成稿", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "点评一下这篇",
      targetFormats: ["video_script"],
      runtimeTask: "new_copy",
    })
    expect(intent.action).toBe("chat")
    expect(intent.avoid.some((a) => a.includes("擅自输出整篇成稿"))).toBe(true)
  })

  it("帮我写一篇口播仍 → create", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "帮我写一篇口播",
      targetFormats: ["video_script"],
    })
    expect(intent.action).toBe("create")
  })

  it("按这个结构写一篇仍 → create（写稿词优先）", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "按这个结构写一篇口播",
    })
    expect(intent.action).toBe("create")
  })

  it("format block 声明最高优先级", () => {
    const block = formatAimTurnIntentBlock(resolveAimTurnIntent({
      rawInput: "写一版口播",
      runtimeTask: "new_copy",
      targetFormats: ["video_script"],
    }))
    expect(block).toContain("【本轮意图】")
    expect(block).toContain("最高优先级")
  })

  it("buildWorkflowContext 顶部注入本轮意图", () => {
    const text = buildWorkflowContext({
      rawInput: "优化这篇开头",
      runtimeTask: "light_edit",
      taskSpec: undefined,
    })
    expect(text.startsWith("【本轮意图】")).toBe(true)
    expect(text).toContain("局部修改")
  })

  it("确认意图优先于规则推断写入 workflow context", () => {
    const confirmed = resolveAimTurnIntent({
      rawInput: "帮我写一篇小红书",
      targetFormats: ["xiaohongshu_post"],
    })
    const edited = applyTurnIntentEdits(confirmed, {
      summary: "本轮意图：用户确认——只写小红书种草，不要口播。",
    })
    const text = buildWorkflowContext({
      rawInput: "随便写点什么",
      runtimeTask: "new_copy",
      taskSpec: undefined,
      confirmedTurnIntent: edited,
    })
    expect(text).toContain("只写小红书种草")
    expect(text).not.toContain("随便写点什么")
  })
})

describe("档案缺口", () => {
  it("未绑项目时 create 提示缺口", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "写一篇小红书种草",
      archive: { hasProject: false },
    })
    expect(intent.action).toBe("create")
    expect(intent.archiveGaps.some((g) => g.includes("未绑定客户项目"))).toBe(true)
    expect(intent.avoid.some((a) => a.includes("档案缺口"))).toBe(true)
  })

  it("未传知识条数时不误报空库", () => {
    const gaps = assessArchiveGaps(
      { action: "create" },
      { hasProject: true },
    )
    expect(gaps.some((g) => g.includes("知识库"))).toBe(false)
  })

  it("显式 knowledgeCount=0 才报空库", () => {
    const gaps = assessArchiveGaps(
      { action: "create" },
      { hasProject: true, knowledgeCount: 0 },
    )
    expect(gaps.some((g) => g.includes("知识库"))).toBe(true)
  })

  it("local_edit 不评估档案缺口", () => {
    const gaps = assessArchiveGaps(
      { action: "local_edit" },
      { hasProject: false, knowledgeCount: 0 },
    )
    expect(gaps).toEqual([])
  })

  it("format block 含档案缺口行", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "写一篇种草文",
      archive: { hasProject: false, knowledgeCount: 0 },
    })
    const block = formatAimTurnIntentBlock(intent)
    expect(block).toContain("档案缺口")
    expect(block).toContain("未提供/待补充")
  })
})

describe("意图确认辅助", () => {
  it("create/rewrite/local_edit/position 需要确认", () => {
    expect(shouldConfirmTurnIntent(resolveAimTurnIntent({ rawInput: "写一篇小红书" }))).toBe(true)
    expect(shouldConfirmTurnIntent(resolveAimTurnIntent({ rawInput: "优化开头" }))).toBe(true)
  })

  it("normalizeConfirmedTurnIntent 校验结构", () => {
    const ok = normalizeConfirmedTurnIntent({
      summary: "本轮意图：新建",
      action: "create",
      scope: "full",
      deliverable: "小红书图文",
      keep: ["选题"],
      avoid: ["编造"],
      archiveGaps: ["缺案例"],
    })
    expect(ok?.action).toBe("create")
    expect(ok?.archiveGaps).toEqual(["缺案例"])
    expect(normalizeConfirmedTurnIntent({ summary: "x" })).toBeNull()
  })

  it("「这篇文案应该怎么优化」→ chat，不走润色出新稿", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "这篇文案应该怎么优化",
      runtimeTask: "rewrite_copy",
    })
    expect(intent.action).toBe("chat")
    expect(intent.summary).toContain("优化建议")
    expect(intent.avoid.some((a) => a.includes("整篇"))).toBe(true)
  })

  it("「这篇文章有没有问题」→ chat", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "这篇文章有没有问题",
    })
    expect(intent.action).toBe("chat")
  })

  it("「优化这篇文案」默认走建议对话，不直接出新稿", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "优化这篇文案",
    })
    expect(intent.action).toBe("chat")
    expect(intent.avoid.some((a) => a.includes("新稿") || a.includes("整篇"))).toBe(true)
  })

  it("「这篇有什么问题」→ chat", () => {
    expect(resolveAimTurnIntent({ rawInput: "这篇有什么问题" }).action).toBe("chat")
  })

  it("「直接改好这篇文案」才走 local_edit 润色", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "直接改好这篇文案输出修改稿",
    })
    expect(intent.action).toBe("local_edit")
  })

  it("「优化这段话别扩写」仍走 local_edit", () => {
    const intent = resolveAimTurnIntent({
      rawInput: "优化这段话别扩写",
    })
    expect(intent.action).toBe("local_edit")
  })
})

describe("stable routing default off", () => {
  it("默认关闭，需显式开启", () => {
    const prev = process.env.AIM_STABLE_ROUTING
    delete process.env.AIM_STABLE_ROUTING
    expect(isStableRoutingEnabled()).toBe(false)
    expect(isStableRoutingEnabled(true)).toBe(true)
    if (prev === undefined) delete process.env.AIM_STABLE_ROUTING
    else process.env.AIM_STABLE_ROUTING = prev
  })
})
