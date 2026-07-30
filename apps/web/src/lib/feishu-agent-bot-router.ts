// ─── 多 Bot 意图路由（一对一模式） ─────────────────────────────
// 每个 bot = 一个智能体，收到的消息默认直接交给自己的智能体。
// 如果用户发了 /命令 且指向其他智能体，则引导到对应 bot。
// 纯函数，无 IO，易于单测。

import { resolveAimChannelIntent, type AimChannelIntent } from "@/lib/aim-channel-router"
import {
  findBotForAgent,
  type FeishuAgentBotConfig,
} from "./feishu-agent-registry"

export type AgentBotRouteResult =
  | { status: "routed"; intent: AimChannelIntent }
  | { status: "cross_bot_redirect"; agentId: string; targetBotName: string; message: string }

/**
 * 对一条消息做 bot 维度的意图路由。
 * 一对一模式：无命令 → 直接交给 bot 自己的智能体；
 * /命令指向其他智能体 → 引导到对应 bot。
 */
export function resolveAgentBotIntent(
  text: string,
  bot: FeishuAgentBotConfig,
): AgentBotRouteResult {
  // 复用现有路由器（/命令 → agentId，无命令 → defaultAgentId）
  const intent = resolveAimChannelIntent(text, bot.defaultAgentId)

  // 路由到自己 → 直接通过
  if (intent.agentId === bot.botId || intent.via === "default") {
    return { status: "routed", intent: { ...intent, agentId: bot.defaultAgentId } }
  }

  // /命令指向当前 bot 显式委托代收的 agent（如作品编辑代收发布质检）
  // → 保留该 agent 引擎不改写，仍以本 bot 身份回复
  if ((bot.allowedAgentIds as string[]).includes(intent.agentId)) {
    return { status: "routed", intent }
  }

  // /命令指向其他智能体 → 引导到对应 bot
  const targetBot = findBotForAgent(intent.agentId, bot.botId)
  if (targetBot) {
    return {
      status: "cross_bot_redirect",
      agentId: intent.agentId,
      targetBotName: targetBot.displayName,
      message: `这个需求找「${targetBot.displayName}」更合适哦，请在和 TA 的对话中发送。`,
    }
  }

  // 没有对应 bot（如 free_copywriter 未注册 bot）→ 回落到自己处理
  return { status: "routed", intent: { ...intent, agentId: bot.defaultAgentId } }
}

/**
 * 生成 bot 专属帮助文案。
 */
export function buildBotHelpText(bot: FeishuAgentBotConfig): string {
  return [
    `我是${bot.displayName}，直接发消息给我就能开始工作。`,
    "",
    `我的职责：${bot.displayName}相关的所有任务。`,
    "如果想使用其他智能体，请在对应机器人的对话中发送。",
  ].join("\n")
}
