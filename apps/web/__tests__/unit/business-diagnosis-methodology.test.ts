import { describe, expect, it, vi, beforeEach } from "vitest"
import type { AimChatParams, AimGenerateContext } from "@/lib/aim-agent-handlers"

// 拦截 LLM 调用与数据库写入，避免真实外部依赖。
// business_diagnosis 的 chat 走 executeChatLLM，generate 走 executeGenerateLLM + saveAimGenerationRecord。
const completeMock = vi.fn()
vi.mock("@/lib/llm/agent-router", () => ({
  getAgentLLM: () => ({
    complete: completeMock,
    stream: vi.fn(),
  }),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: { create: vi.fn().mockResolvedValue({ id: "rec-1" }) },
    clientProject: { findFirst: vi.fn() },
  },
}))
// 知识检索走空，避免触发 embedding
vi.mock("@/lib/aim-knowledge-context", () => ({
  buildAimKnowledgeContext: vi.fn().mockResolvedValue({
    knowledgeBlock: "",
    entries: [],
    source: "raw",
  }),
  fireKnowledgeEmbedding: vi.fn(),
}))

// 必须在 mock 之后导入
const { buildBusinessDiagnosisMethodologyBlock } = await import("@/lib/business-diagnosis-methodology")
const { buildIpCopywritingMethodologyBlock } = await import("@/lib/ip-copywriting-methodology")
const { getAgentHandler } = await import("@/lib/aim-agent-handlers")
const { AIM_AGENT_GUIDES } = await import("@/lib/aim-agent-guides")

describe("business-diagnosis-methodology", () => {
  it("loads the project business diagnosis methodology without external framework traces", async () => {
    const block = await buildBusinessDiagnosisMethodologyBlock()

    expect(block).toContain("信息校准")
    expect(block).toContain("概念澄清")
    expect(block).toContain("生意系统诊断")
    expect(block).toContain("行业参照校验")
    expect(block).toContain("多视角复核")
    for (const hiddenTrace of [
      ["D", "BS"].join(""),
      ["六顶", "思考帽"].join(""),
      ["斜杠", "命令"].join(""),
      ["同行", "框架"].join(""),
    ]) {
      expect(block).not.toContain(hiddenTrace)
    }
  })
})

function buildChatParams(overrides: Partial<AimChatParams> = {}): AimChatParams {
  return {
    userId: "test-user",
    conversationBlock: "",
    messages: [{ role: "user", content: "帮我做 IP 定位" }],
    knowledgeBlock: "【知识库】示例知识",
    methodologyBlock: "【IP操盘方法论】IP账号定位与内容策略策划阶段",
    businessDiagnosisBlock: "",
    ipWikiBlock: "",
    selectedMethodologyBlock: "",
    ...overrides,
  }
}

function buildGenerateContext(overrides: Partial<AimGenerateContext> = {}): AimGenerateContext {
  return {
    userId: "test-user",
    agentId: "business_diagnosis",
    rawInput: "AI 工具账号定位",
    targetFormats: ["raw_copy"],
    knowledgeBlock: "【知识库】示例知识",
    methodologyBlock: "【IP操盘方法论】IP账号定位与内容策略策划阶段",
    businessDiagnosisBlock: "",
    viralStructureBlock: "",
    eventStorytellingBlock: "",
    ipWikiBlock: "",
    selectedMethodologyBlock: "",
    retrievedEntries: [],
    retrievedSource: "raw",
    knowledgeStrategy: "deep",
    ...overrides,
  } as AimGenerateContext
}

/** 从 LLM complete 的入参里取出 systemPrompt（messages[0].content） */
function capturedSystemPrompt(): string {
  const call = completeMock.mock.calls[0]?.[0]
  return call?.messages?.[0]?.content ?? ""
}

describe("定位策划官 prompt 保护", () => {
  beforeEach(() => {
    completeMock.mockReset()
    completeMock.mockResolvedValue({ content: "ok", model: "test", usage: { totalTokens: 0 } })
  })

  it("chat prompt injects methodologyBlock", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("【IP操盘方法论】IP账号定位与内容策略策划阶段")
    expect(systemPrompt).toContain("IP操盘方法论")
  })

  it("generate prompt includes 内容策略底盘", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("内容策略底盘")
    expect(systemPrompt).toContain("【IP操盘方法论】IP账号定位与内容策略策划阶段")
  })

  it("generate prompt includes 指导后续选题和文案", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("指导后续选题和文案")
  })

  it("generate prompt requires source-backed positioning evidence", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("关键数据来源与依据")
    expect(systemPrompt).toContain("数据分析、数据来源、数据精选")
    expect(systemPrompt).toContain("人设特点的真正挖掘")
    expect(systemPrompt).toContain("对标综合判断")
    expect(systemPrompt).toContain("不得编造来源")
  })

  it("generate prompt requires account analysis references and core positioning points", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("账号分析参考来源")
    expect(systemPrompt).toContain("已分析对标账号")
    expect(systemPrompt).toContain("内容母题")
    expect(systemPrompt).toContain("核心点位设计")
    expect(systemPrompt).toContain("定位点位、人设点位、内容点位、信任点位、成交点位、差异化点位")
  })

  it("business diagnosis prompt supports three positioning routes", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("选题策划路由")
    expect(systemPrompt).toContain("完整 IP 策划路由")
    expect(systemPrompt).toContain("人设卖点梳理路由")
    expect(systemPrompt).toContain("下一轮确认问题")
    expect(systemPrompt).toContain("人设卖点")
  })

  it("chat prompt makes meeting minutes asset packs evidence-dense", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("纯会议纪要整理路由")
    expect(systemPrompt).toContain("只做会议纪要整理")
    expect(systemPrompt).toContain("不用做其他动作")
    expect(systemPrompt).toContain("只输出会议纪要整理结果")
    expect(systemPrompt).toContain("整理完成后默认停在这里")
    expect(systemPrompt).toContain("会议纪要内容资产包路由必须高密度")
    expect(systemPrompt).toContain("关键信息抽取表")
    expect(systemPrompt).toContain("至少 12 条")
    expect(systemPrompt).toContain("会议证据")
    expect(systemPrompt).toContain("禁止结尾反问")
  })

  it("generate prompt supports pure meeting-minutes organization without action outputs", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("C. 纯会议纪要整理路由")
    expect(systemPrompt).toContain("只做会议纪要整理")
    expect(systemPrompt).toContain("不要选题")
    expect(systemPrompt).toContain("不要任务清单")
    expect(systemPrompt).toContain("整理完成后默认停止")
    expect(systemPrompt).toContain("不要输出选题池、优先级、执行清单、采访清单、脚本/分镜")
  })

  it("chat prompt includes the shared high-risk verification rule", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("高风险任务验证规则")
    expect(systemPrompt).toContain("验证结果")
    expect(systemPrompt).toContain("未提供/待补充")
  })
})

describe("商业诊断官 business_system_diagnosis 方法论 block", () => {
  it("包含问诊消解漏斗与各类问题分类", async () => {
    const block = await buildBusinessDiagnosisMethodologyBlock()

    expect(block).toContain("问诊消解漏斗")
    expect(block).toContain("信息类问题")
    expect(block).toContain("情绪类问题")
    expect(block).toContain("语言陷阱")
    expect(block).toContain("假设错误")
    expect(block).toContain("逻辑错误")
    expect(block).toContain("事实前提不清")
    expect(block).toContain("信息不足")
  })

  it("包含常见语言陷阱与错误假设示例", async () => {
    const block = await buildBusinessDiagnosisMethodologyBlock()

    // 语言陷阱词
    expect(block).toContain("高端")
    expect(block).toContain("适合")
    expect(block).toContain("值得")
    // 错误假设
    expect(block).toContain("有流量就能成交")
    expect(block).toContain("产品好就该卖")
    expect(block).toContain("发得多就会爆")
  })

  it("要求只给 1 个核心矛盾并保留四层诊断报告结构", async () => {
    const block = await buildBusinessDiagnosisMethodologyBlock()

    expect(block).toContain("只保留一个主矛盾")
    expect(block).toContain("生意系统四层诊断")
    expect(block).toContain("三条调整路径")
    expect(block).toContain("本周最小动作")
  })

  it("不暴露外部框架名（DBS / 命令式 skill 名）", async () => {
    const block = await buildBusinessDiagnosisMethodologyBlock()

    for (const hiddenTrace of [
      ["D", "BS"].join(""),
      ["dont", "besilent"].join(""),
      ["斜杠", "命令"].join(""),
    ]) {
      expect(block).not.toContain(hiddenTrace)
    }
  })
})

describe("商业诊断官 chat prompt 消解漏斗路由", () => {
  beforeEach(() => {
    completeMock.mockReset()
    completeMock.mockResolvedValue({ content: "ok", model: "test", usage: { totalTokens: 0 } })
  })

  it("先判断问题是否成立", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("先判断用户的问题是否成立")
    expect(systemPrompt).toContain("问诊消解漏斗")
  })

  it("命中语言陷阱 / 假设错误时不直接给方案，先追问", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("高端")
    expect(systemPrompt).toContain("有流量就能成交")
    expect(systemPrompt).toContain("不直接给方案")
  })

  it("每次只追问一个关键问题", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("每次只追问一个")
  })

  it("信息不足时才追问、足够时才提醒生成报告", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("只有当问题成立")
    expect(systemPrompt).toContain("才提醒用户可以点击【一键生成】")
  })
})

describe("AIM high-risk loop prompt coverage", () => {
  beforeEach(() => {
    completeMock.mockReset()
    completeMock.mockResolvedValue({ content: "ok", model: "test", usage: { totalTokens: 0 } })
  })

  it("keeps work_editor on polish/layout duties while still attaching high-risk loop rules", async () => {
    const handler = getAgentHandler("work_editor")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("只做三件事")
    expect(systemPrompt).toContain("文字二改/润色")
    expect(systemPrompt).toContain("公众号排版")
    expect(systemPrompt).toContain("小红书图文")
    expect(systemPrompt).toContain("内容创作")
    expect(systemPrompt).toContain("框架阶段或追问阶段，不要追加“验证结果”区块")
    expect(systemPrompt).toContain("验证结论绝不进正文")
    expect(systemPrompt).not.toContain("正式交付内容结尾追加一个简短“验证结果”区块")
  })

  it("keeps work_editor generate focused on editing, not deep-longform drafting", async () => {
    const handler = getAgentHandler("work_editor")
    await handler.generate(buildGenerateContext({
      rawInput: [
        "【成稿】",
        "我们始终坚信，只有把客户价值做到极致，才能赢得市场的尊重。",
        "",
        "请对上面成稿做文字二改/润色，去 AI 味。",
      ].join("\n"),
    }))

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("禁止从零写深度长文")
    expect(systemPrompt).toContain("内容创作")
    expect(systemPrompt).toContain("润色 / 公众号排版 / 小红书图文")
    expect(systemPrompt).not.toContain("先输出文案框架")
    expect(systemPrompt).not.toContain("一篇完整深度长文")
  })

  it("adds loop rules to business_system_diagnosis without breaking the eight-section report", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.generate(buildGenerateContext({ businessDiagnosisBlock: "【商业诊断方法论】示例体检规则" }))

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("高风险任务验证规则")
    expect(systemPrompt).toContain("验证结果")
    expect(systemPrompt).toContain("未提供/待补充")
    expect(systemPrompt).toContain("体检报告必须严格按以下八段固定结构输出")
    expect(systemPrompt).toContain("业务现状说明")
    expect(systemPrompt).toContain("本周最小动作")
  })
})

describe("商业诊断官 generate prompt 固定报告结构", () => {
  beforeEach(() => {
    completeMock.mockReset()
    completeMock.mockResolvedValue({ content: "ok", model: "test", usage: { totalTokens: 0 } })
  })

  it("包含八段固定报告结构", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("业务现状说明")
    expect(systemPrompt).toContain("模糊概念澄清")
    expect(systemPrompt).toContain("生意系统四层诊断")
    expect(systemPrompt).toContain("核心矛盾判断")
    expect(systemPrompt).toContain("行业参照校验")
    expect(systemPrompt).toContain("多视角复核")
    expect(systemPrompt).toContain("三条调整路径")
    expect(systemPrompt).toContain("本周最小动作")
  })

  it("只给 1 个核心矛盾", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("只给 1 个核心矛盾")
  })

  it("每条建议绑定资源/人力/时间/风险", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("绑定资源、人力、时间、风险")
  })

  it("禁止营销分发内容输出", async () => {
    const handler = getAgentHandler("business_system_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("短视频脚本")
    expect(systemPrompt).toContain("朋友圈文案")
    expect(systemPrompt).toContain("社群文案")
    expect(systemPrompt).toContain("禁止输出")
  })
})

describe("定位策划官 天命IP资产化操盘全案路由 (F)", () => {
  beforeEach(() => {
    completeMock.mockReset()
    completeMock.mockResolvedValue({ content: "ok", model: "test", usage: { totalTokens: 0 } })
  })

  it("方法论卡片 7 包含 12 模块与天命底盘约束", async () => {
    const block = await buildIpCopywritingMethodologyBlock()

    expect(block).toContain("方法论卡片 7：天命IP资产化操盘全案")
    expect(block).toContain("交付资产化")
    expect(block).toContain("行动处方")
    expect(block).toContain("天命底盘")
    // 12 个模块名都应在
    for (const moduleName of [
      "项目总判断", "天命底盘", "IP 主定位", "目标客户", "核心问题", "IP 价值",
      "产品设计", "内容系统", "流量闭环", "私域成交", "交付资产化", "行动处方",
    ]) {
      expect(block).toContain(moduleName)
    }
    // 天命底盘无资料时的约束
    expect(block).toContain("未提供/待补充")
    expect(block).toContain("不编造")
  })

  it("方法论卡片 7 要求区分已验证事实/推断判断/待补充证据", async () => {
    const block = await buildIpCopywritingMethodologyBlock()
    expect(block).toContain("已验证事实")
    expect(block).toContain("推断判断")
    expect(block).toContain("待补充证据")
  })

  it("chat prompt 包含 F 路由触发条件（不替换 D 完整 IP 策划路由）", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    // 原 D 路由保留
    expect(systemPrompt).toContain("完整 IP 策划路由")
    // 新 F 路由触发词
    expect(systemPrompt).toContain("天命IP资产化操盘全案路由")
    expect(systemPrompt).toContain("天命IP")
    expect(systemPrompt).toContain("资产化")
    expect(systemPrompt).toContain("操盘全案")
    expect(systemPrompt).toContain("12 模块")
    // 来自商业诊断官的触发
    expect(systemPrompt).toContain("生意系统体检")
  })

  it("chat prompt 天命底盘无命理资料时写未提供/待补充", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.chat(buildChatParams())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("未提供/待补充")
    expect(systemPrompt).toContain("不编造命理")
  })

  it("generate prompt 包含 F 路由固定 12 模块输出结构", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("F. 天命IP资产化操盘全案路由")
    for (const moduleName of [
      "项目总判断", "天命底盘", "IP 主定位", "目标客户", "核心问题", "IP 价值",
      "产品设计", "内容系统", "流量闭环", "私域成交", "交付资产化", "行动处方",
    ]) {
      expect(systemPrompt).toContain(moduleName)
    }
    // 触发条件
    expect(systemPrompt).toContain("商业验证后")
    expect(systemPrompt).toContain("生意系统体检")
  })

  it("generate prompt 区分已验证事实/推断判断/待补充证据", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("已验证事实")
    expect(systemPrompt).toContain("推断判断")
    expect(systemPrompt).toContain("待补充证据")
  })

  it("generate prompt 要求基于客户知识库输出而不是展示方法论公式", async () => {
    const handler = getAgentHandler("business_diagnosis")
    await handler.generate(buildGenerateContext())

    const systemPrompt = capturedSystemPrompt()
    expect(systemPrompt).toContain("客户知识库/客户资料/本轮上下文是正文依据")
    expect(systemPrompt).toContain("禁止把方法论名称、定位公式、模块解释、占位符模板原样呈现给用户")
    expect(systemPrompt).not.toContain("定位公式\"我是【身份】")
  })

  it("商业诊断官 to_business_diagnosis 按钮生成天命全案", async () => {
    const guide = AIM_AGENT_GUIDES.business_system_diagnosis
    const action = guide.nextActions.find((a) => a.id === "to_business_diagnosis")

    expect(action).toBeDefined()
    expect(action?.label).toBe("生成天命全案")
    expect(action?.targetAgentId).toBe("business_diagnosis")
    expect(action?.prompt).toContain("天命IP资产化操盘全案")
    expect(action?.prompt).toContain("12 个客户结果段")
    expect(action?.prompt).toContain("交付资产化")
    expect(action?.prompt).toContain("未提供/待补充")
    expect(action?.prompt).toContain("客户知识库")
    expect(action?.prompt).toContain("不要把定位公式")
  })
})
