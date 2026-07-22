import { describe, it, expect, vi } from "vitest"

vi.mock("@/env", () => ({
  env: {
    FEISHU_BOT_CONTENT_PRODUCER_APP_ID: "cli_cp",
    FEISHU_BOT_CONTENT_PRODUCER_APP_SECRET: "secret_cp",
    FEISHU_BOT_CONTENT_PRODUCER_VERIFY_TOKEN: "token_cp",
    FEISHU_BOT_CONTENT_PRODUCER_ENCRYPT_KEY: "encrypt_cp",
    FEISHU_BOT_CONTENT_PRODUCER_SUPERVISOR_CHAT_ID: "oc_cp",
    FEISHU_BOT_DEEP_COPYWRITER_APP_ID: "cli_dc",
    FEISHU_BOT_DEEP_COPYWRITER_APP_SECRET: "secret_dc",
    FEISHU_BOT_DEEP_COPYWRITER_VERIFY_TOKEN: "token_dc",
    FEISHU_BOT_DEEP_COPYWRITER_ENCRYPT_KEY: "encrypt_dc",
    FEISHU_BOT_DEEP_COPYWRITER_SUPERVISOR_CHAT_ID: "oc_dc",
    FEISHU_BOT_BIZ_DIAGNOSIS_APP_ID: "cli_bd",
    FEISHU_BOT_BIZ_DIAGNOSIS_APP_SECRET: "secret_bd",
    FEISHU_BOT_BIZ_DIAGNOSIS_VERIFY_TOKEN: "token_bd",
    FEISHU_BOT_BIZ_DIAGNOSIS_ENCRYPT_KEY: "encrypt_bd",
    FEISHU_BOT_BIZ_DIAGNOSIS_SUPERVISOR_CHAT_ID: "oc_bd",
    FEISHU_BOT_TOPIC_PLANNER_APP_ID: "cli_tp",
    FEISHU_BOT_TOPIC_PLANNER_APP_SECRET: "secret_tp",
    FEISHU_BOT_TOPIC_PLANNER_VERIFY_TOKEN: "token_tp",
    FEISHU_BOT_TOPIC_PLANNER_ENCRYPT_KEY: "encrypt_tp",
    FEISHU_BOT_TOPIC_PLANNER_SUPERVISOR_CHAT_ID: "oc_tp",
    FEISHU_BOT_CONTENT_REVIEW_APP_ID: "cli_cr",
    FEISHU_BOT_CONTENT_REVIEW_APP_SECRET: "secret_cr",
    FEISHU_BOT_CONTENT_REVIEW_VERIFY_TOKEN: "token_cr",
    FEISHU_BOT_CONTENT_REVIEW_ENCRYPT_KEY: "encrypt_cr",
    FEISHU_BOT_CONTENT_REVIEW_SUPERVISOR_CHAT_ID: "oc_cr",
    FEISHU_BOT_PERSONA_APP_ID: "cli_ps",
    FEISHU_BOT_PERSONA_APP_SECRET: "secret_ps",
    FEISHU_BOT_PERSONA_VERIFY_TOKEN: "token_ps",
    FEISHU_BOT_PERSONA_ENCRYPT_KEY: "encrypt_ps",
    FEISHU_BOT_PERSONA_SUPERVISOR_CHAT_ID: "oc_ps",
    FEISHU_ENCRYPT_KEY: "encrypt_default",
  },
}))

import { resolveAgentBotIntent, buildBotHelpText } from "@/lib/feishu-agent-bot-router"
import { getAgentBotAckReply, getBotRoleConstraint, shouldInjectBotPersona } from "@/lib/feishu-agent-persona"
import { buildWorkItemCard } from "@/lib/feishu-agent-card"
import { isAgentAllowedForBot, resolveBotByVerificationToken, loadAgentBotRegistry, type FeishuAgentBotConfig } from "@/lib/feishu-agent-registry"

// ─── 测试用 bot 配置 ─────────────────────────────────────────────

const mockContentProducer: FeishuAgentBotConfig = {
  botId: "content_producer",
  displayName: "内容创作官",
  appId: "cli_cp",
  appSecret: "secret_cp",
  verificationToken: "token_cp",
  workflowId: "content_growth",
  defaultAgentId: "content_producer",
  allowedAgentIds: ["content_producer"],
  supervisorChatId: "oc_cp",
}

const mockBizDiagnosis: FeishuAgentBotConfig = {
  botId: "business_system_diagnosis",
  displayName: "商业诊断官",
  appId: "cli_bd",
  appSecret: "secret_bd",
  verificationToken: "token_bd",
  workflowId: "sales_diagnosis",
  defaultAgentId: "business_system_diagnosis",
  allowedAgentIds: ["business_system_diagnosis"],
  supervisorChatId: "oc_bd",
}

const mockContentReview: FeishuAgentBotConfig = {
  botId: "content_review",
  displayName: "发布质检官",
  appId: "cli_cr",
  appSecret: "secret_cr",
  verificationToken: "token_cr",
  workflowId: "content_growth",
  defaultAgentId: "content_review",
  allowedAgentIds: ["content_review"],
  supervisorChatId: "oc_cr",
}

// ─── feishu-agent-bot-router ─────────────────────────────────────

describe("resolveAgentBotIntent", () => {
  it("无命令时直接路由到 bot 自己的智能体", () => {
    const result = resolveAgentBotIntent("帮我写一条口播", mockContentProducer)
    expect(result.status).toBe("routed")
    if (result.status === "routed") {
      expect(result.intent.agentId).toBe("content_producer")
      expect(result.intent.cleanedInput).toBe("帮我写一条口播")
    }
  })

  it("/命令指向自己时正常路由", () => {
    const result = resolveAgentBotIntent("/内容创作 帮我写一条口播", mockContentProducer)
    expect(result.status).toBe("routed")
    if (result.status === "routed") {
      expect(result.intent.agentId).toBe("content_producer")
    }
  })

  it("/命令指向其他 bot 时触发跨 bot 引导", () => {
    const result = resolveAgentBotIntent("/商业诊断 帮我分析一下", mockContentProducer)
    expect(result.status).toBe("cross_bot_redirect")
    if (result.status === "cross_bot_redirect") {
      expect(result.message).toContain("商业诊断官")
    }
  })

  it("诊断官收到内容创作命令时引导到内容创作官", () => {
    const result = resolveAgentBotIntent("/内容创作 写一条口播", mockBizDiagnosis)
    expect(result.status).toBe("cross_bot_redirect")
    if (result.status === "cross_bot_redirect") {
      expect(result.message).toContain("内容创作官")
    }
  })

  it("诊断官收到无命令消息时路由到自己", () => {
    const result = resolveAgentBotIntent("分析一下我的商业模式", mockBizDiagnosis)
    expect(result.status).toBe("routed")
    if (result.status === "routed") {
      expect(result.intent.agentId).toBe("business_system_diagnosis")
    }
  })
})

describe("buildBotHelpText", () => {
  it("包含 bot 名称", () => {
    const text = buildBotHelpText(mockContentProducer)
    expect(text).toContain("内容创作官")
  })

  it("提示直接发消息", () => {
    const text = buildBotHelpText(mockBizDiagnosis)
    expect(text).toContain("直接发消息")
  })
})

// ─── feishu-agent-persona ─────────────────────────────────────

describe("getAgentBotAckReply", () => {
  it("内容创作官有个性化 ACK", () => {
    const ack = getAgentBotAckReply("content_producer")
    expect(ack).toContain("创作")
  })

  it("商业诊断官有个性化 ACK", () => {
    const ack = getAgentBotAckReply("business_system_diagnosis")
    expect(ack).toContain("诊断")
  })

  it("发布质检官有个性化 ACK", () => {
    const ack = getAgentBotAckReply("content_review")
    expect(ack).toContain("质检")
  })
})

describe("getBotRoleConstraint", () => {
  it("每个 bot 都有角色约束", () => {
    expect(getBotRoleConstraint("content_producer")).toContain("内容创作官")
    expect(getBotRoleConstraint("deep_copywriter")).toContain("作品编辑官")
    expect(getBotRoleConstraint("business_system_diagnosis")).toContain("商业诊断官")
    expect(getBotRoleConstraint("business_diagnosis")).toContain("灵感选题官")
    expect(getBotRoleConstraint("content_review")).toContain("发布质检官")
    expect(getBotRoleConstraint("persona")).toContain("人设故事官")
  })
})

describe("shouldInjectBotPersona", () => {
  it("有效 botId 返回 true", () => {
    expect(shouldInjectBotPersona("content_producer")).toBe(true)
    expect(shouldInjectBotPersona("business_system_diagnosis")).toBe(true)
  })

  it("null/undefined 返回 false", () => {
    expect(shouldInjectBotPersona(null)).toBe(false)
    expect(shouldInjectBotPersona(undefined)).toBe(false)
  })
})

// ─── feishu-agent-card ─────────────────────────────────────

describe("buildWorkItemCard", () => {
  it("review_required 卡片包含审核按钮", () => {
    const json = buildWorkItemCard(mockContentProducer, {
      itemName: "测试口播文案",
      recordId: "rec_123",
      workflowId: "content_growth",
      cardType: "review_required",
      summary: "已完成初稿",
      resultLink: "https://example.com/result/123",
    })
    const card = JSON.parse(json)
    expect(card.header.title.content).toContain("内容创作官")
    expect(card.header.title.content).toContain("待人工审核")
    expect(card.header.template).toBe("orange")

    const actionElements = card.elements.filter((e: { tag: string }) => e.tag === "action")
    const buttons = actionElements.flatMap((e: { actions?: unknown[] }) => e.actions || [])
    const buttonTexts = buttons.map((b: { text?: { content?: string } }) => b.text?.content)
    expect(buttonTexts).toContain("通过")
    expect(buttonTexts).toContain("打回修改")
  })

  it("completed 卡片不包含审核按钮", () => {
    const json = buildWorkItemCard(mockBizDiagnosis, {
      itemName: "商业诊断报告",
      recordId: "rec_456",
      workflowId: "sales_diagnosis",
      cardType: "completed",
      summary: "诊断完成",
    })
    const card = JSON.parse(json)
    expect(card.header.template).toBe("green")
    const allButtons = JSON.stringify(card).match(/"通过"/g)
    expect(allButtons).toBeNull()
  })

  it("failed 卡片包含错误信息", () => {
    const json = buildWorkItemCard(mockContentReview, {
      itemName: "失败的文案",
      recordId: "rec_789",
      workflowId: "content_growth",
      cardType: "failed",
      errorMessage: "模型调用超时",
    })
    const card = JSON.parse(json)
    expect(card.header.template).toBe("red")
    expect(JSON.stringify(card)).toContain("模型调用超时")
  })
})

// ─── feishu-agent-registry ─────────────────────────────────────

describe("registry", () => {
  it("loadAgentBotRegistry 返回 6 个 bot", () => {
    const registry = loadAgentBotRegistry()
    expect(registry.length).toBe(6)
  })

  it("resolveBotByVerificationToken 正确识别 bot", () => {
    const bot = resolveBotByVerificationToken("token_cp")
    expect(bot).not.toBeNull()
    expect(bot!.botId).toBe("content_producer")
    expect(bot!.displayName).toBe("内容创作官")
  })

  it("isAgentAllowedForBot 一对一模式仅允许自己", () => {
    expect(isAgentAllowedForBot(mockContentProducer, "content_producer")).toBe(true)
    expect(isAgentAllowedForBot(mockContentProducer, "business_system_diagnosis")).toBe(false)
  })
})
