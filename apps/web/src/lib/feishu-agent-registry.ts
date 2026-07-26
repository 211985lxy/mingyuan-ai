// ─── 飞书多智能体 Bot 注册表 ─────────────────────────────────
// 纯配置模块：将飞书事件中的 verification token 映射到具体的 bot 身份。
// 每个 bot = 一个飞书自建应用 = 一个 AIM 智能体（一对一）。
// 不新增状态机、不新增 Agent Runtime——仅是身份路由配置。

import { env } from "@/env"
import type { AimAgentId } from "@/lib/aim-harness/contracts"

/** botId 直接等于 AimAgentId，一对一映射 */
export type FeishuAgentBotId = AimAgentId

export interface FeishuAgentBotConfig {
  botId: FeishuAgentBotId
  /** 飞书通讯录中显示的名称 */
  displayName: string
  appId: string
  appSecret: string
  verificationToken: string
  encryptKey?: string
  /** 对应 Base「工作流」字段值 */
  workflowId: string
  /** 该 bot 绑定的唯一智能体（一对一，始终等于 botId） */
  defaultAgentId: AimAgentId
  /** 该 bot 可路由到的 AIM 智能体白名单（一对一模式下仅含自身） */
  allowedAgentIds: AimAgentId[]
  /** 该 bot 的主动推送目标群（可选） */
  supervisorChatId?: string
}

/**
 * 从环境变量构建 bot 配置。凭证不完整时返回 null（fail-closed）。
 */
function buildBotConfig(
  botId: FeishuAgentBotId,
  displayName: string,
  workflowId: string,
  envAppId: string | undefined,
  envAppSecret: string | undefined,
  envVerifyToken: string | undefined,
  envEncryptKey: string | undefined,
  envSupervisorChatId: string | undefined,
): FeishuAgentBotConfig | null {
  const appId = envAppId?.trim() || ""
  const appSecret = envAppSecret?.trim() || ""
  const verificationToken = envVerifyToken?.trim() || ""
  if (!appId || !appSecret || !verificationToken) return null

  return {
    botId,
    displayName,
    appId,
    appSecret,
    verificationToken,
    encryptKey: envEncryptKey?.trim() || undefined,
    workflowId,
    defaultAgentId: botId,
    allowedAgentIds: [botId],
    supervisorChatId: envSupervisorChatId?.trim() || undefined,
  }
}

/** 6 个 bot 的静态元信息（displayName + workflowId） */
const BOT_META: Record<string, { displayName: string; workflowId: string }> = {
  content_producer: { displayName: "内容创作", workflowId: "content_growth" },
  work_editor: { displayName: "作品编辑", workflowId: "content_growth" },
  business_system_diagnosis: { displayName: "商业诊断", workflowId: "sales_diagnosis" },
  business_diagnosis: { displayName: "选题策划", workflowId: "sales_diagnosis" },
  content_review: { displayName: "发布质检", workflowId: "content_growth" },
  persona: { displayName: "人设故事", workflowId: "content_growth" },
}

/** 环境变量前缀映射 */
const BOT_ENV_PREFIX: Record<string, string> = {
  content_producer: "FEISHU_BOT_CONTENT_PRODUCER",
  work_editor: "FEISHU_BOT_WORK_EDITOR",
  business_system_diagnosis: "FEISHU_BOT_BIZ_DIAGNOSIS",
  business_diagnosis: "FEISHU_BOT_TOPIC_PLANNER",
  content_review: "FEISHU_BOT_CONTENT_REVIEW",
  persona: "FEISHU_BOT_PERSONA",
}

const ALL_AGENT_IDS: AimAgentId[] = [
  "content_producer",
  "work_editor",
  "business_system_diagnosis",
  "business_diagnosis",
  "content_review",
  "persona",
]

/**
 * 运行时读取所有已配置的 bot。
 * 每次调用都重新读取 env，确保热更新环境变量后无需重启。
 */
export function loadAgentBotRegistry(): FeishuAgentBotConfig[] {
  const bots: FeishuAgentBotConfig[] = []
  const envRecord = env as unknown as Record<string, string | undefined>

  for (const agentId of ALL_AGENT_IDS) {
    const prefix = BOT_ENV_PREFIX[agentId]
    const bot = buildBotConfig(
      agentId,
      BOT_META[agentId].displayName,
      BOT_META[agentId].workflowId,
      envRecord[`${prefix}_APP_ID`],
      envRecord[`${prefix}_APP_SECRET`],
      envRecord[`${prefix}_VERIFY_TOKEN`],
      envRecord[`${prefix}_ENCRYPT_KEY`],
      envRecord[`${prefix}_SUPERVISOR_CHAT_ID`],
    )
    if (bot) bots.push(bot)
  }

  return bots
}

/**
 * 根据飞书事件中的 verification token 识别 bot 身份。
 * 未匹配任何已注册 bot 时返回 null（调用方可回落到旧选题机器人逻辑）。
 */
export function resolveBotByVerificationToken(token: string): FeishuAgentBotConfig | null {
  if (!token) return null
  const registry = loadAgentBotRegistry()
  return registry.find((bot) => bot.verificationToken === token) ?? null
}

/**
 * 根据 botId 查找配置（用于执行结果回推时按工作流找 bot）。
 */
export function resolveBotById(botId: FeishuAgentBotId): FeishuAgentBotConfig | null {
  const registry = loadAgentBotRegistry()
  return registry.find((bot) => bot.botId === botId) ?? null
}

/**
 * 根据工作流 ID 查找对应的 bot（用于执行结果回推）。
 */
export function resolveBotByWorkflowId(workflowId: string): FeishuAgentBotConfig | null {
  if (!workflowId) return null
  const registry = loadAgentBotRegistry()
  return registry.find((bot) => bot.workflowId === workflowId) ?? null
}

/**
 * 判断某个 agentId 是否在指定 bot 的白名单内。
 */
export function isAgentAllowedForBot(bot: FeishuAgentBotConfig, agentId: string): boolean {
  return (bot.allowedAgentIds as string[]).includes(agentId)
}

/**
 * 找到拥有指定 agentId 权限的其他 bot（用于跨 bot 引导提示）。
 */
export function findBotForAgent(agentId: string, excludeBotId?: FeishuAgentBotId): FeishuAgentBotConfig | null {
  const registry = loadAgentBotRegistry()
  return registry.find(
    (bot) => bot.botId !== excludeBotId && (bot.allowedAgentIds as string[]).includes(agentId),
  ) ?? null
}
