// ─── 飞书/微信消息 → AIM 智能体 意图路由器 ─────────────────
// 解析聊天消息中的 /命令前缀，映射到对应 AIM 智能体；
// 无命令时回落到绑定的默认智能体。
// 纯函数，无 IO，易于单测。

import type { AimAgentId } from "@/lib/aim-harness/contracts"

export interface AimChannelIntent {
  /** 选中的智能体 ID */
  agentId: AimAgentId
  /** 剥离命令前缀后的用户输入 */
  cleanedInput: string
  /** 命中方式：command（/命令）/ default（绑定默认）/ unknown（无法识别） */
  via: "command" | "default" | "unknown"
}

/**
 * 命令别名 → 智能体 ID 映射。
 * 用户在飞书里可以用任意一个别名触发，例如 `/内容创作`、`/写文案`、`/口播`。
 * 别名都是小写、去空格匹配，所以 "内容创作" 和 "内容 创作" 等价。
 */
const COMMAND_ALIASES: Array<{ agentId: AimAgentId; aliases: string[] }> = [
  {
    agentId: "content_producer",
    aliases: ["内容创作", "内容文案", "内容文案创作", "内容创作官", "写文案", "口播", "短视频", "社媒", "种草"],
  },
  {
    agentId: "deep_copywriter",
    aliases: ["作品编辑", "作品编辑官", "润色", "二改", "排版", "公众号排版", "小红书"],
  },
  {
    agentId: "free_copywriter",
    aliases: ["自由", "自由文案", "自由撰稿人", "交货", "交货文案", "交货文案创作", "直接写"],
  },
  {
    agentId: "business_diagnosis",
    aliases: ["选题", "灵感选题", "选题策划", "选题策划", "对标"],
  },
  {
    agentId: "business_system_diagnosis",
    aliases: ["商业诊断", "商业模式", "商业模式诊断", "诊断", "体检"],
  },
  {
    agentId: "content_review",
    aliases: ["质检", "发布前质检", "检查", "自查", "风险"],
  },
  {
    agentId: "persona",
    aliases: ["人设", "人设故事", "人设故事官", "人设梳理官", "人设故事梳理", "人设梳理", "来时路", "置顶视频"],
  },
]

/** 预计算：别名（去空格、小写）→ agentId 的扁平查找表 */
const ALIAS_LOOKUP: Map<string, AimAgentId> = (() => {
  const map = new Map<string, AimAgentId>()
  for (const { agentId, aliases } of COMMAND_ALIASES) {
    for (const alias of aliases) {
      map.set(normalize(alias), agentId)
    }
  }
  return map
})()

function normalize(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase()
}

/**
 * 从消息文本里提取 /命令 及其后的内容。
 * 支持的命令形式：
 *   /内容创作 帮我写一条口播
 *   ／内容创作 帮我写一条口播   （全角斜杠）
 *   #内容创作 帮我写一条口播     （兼容 # 前缀）
 * 返回 { command, rest } 或 null（无命令）。
 */
export function extractCommandPrefix(text: string): { command: string; rest: string } | null {
  const trimmed = text.trimStart()
  // 匹配前导符号（/ ／ #）后紧跟非空白字符序列作为命令词
  const match = trimmed.match(/^[／/#]\s*([^\s／/#]+)\s*([\s\S]*)$/)
  if (!match) return null
  const command = match[1]
  const rest = (match[2] || "").trim()
  return { command, rest }
}

/**
 * 解析一条聊天消息，决定调用哪个 AIM 智能体。
 *
 * 优先级：
 * 1. /命令前缀 → 映射到对应智能体，cleanedInput 为剥离前缀后的内容
 * 2. 无命令 + 有默认智能体 → 用默认智能体，cleanedInput 为整段文本
 * 3. 无命令 + 无默认 → via: "unknown"，调用方应提示用户使用 /命令
 *
 * @param text 用户发送的原始消息文本
 * @param defaultAgentId 绑定的默认智能体（可选）
 */
export function resolveAimChannelIntent(
  text: string,
  defaultAgentId?: string | null,
): AimChannelIntent {
  const command = extractCommandPrefix(text)

  if (command) {
    const matched = ALIAS_LOOKUP.get(normalize(command.command))
    if (matched) {
      return {
        agentId: matched,
        cleanedInput: command.rest,
        via: "command",
      }
    }
    // 命令存在但无法识别 → 如果有默认智能体，把命令当普通文本走默认；
    // 否则标记 unknown，让调用方提示可用命令。
    if (defaultAgentId) {
      return {
        agentId: defaultAgentId as AimAgentId,
        cleanedInput: text.trim(),
        via: "default",
      }
    }
    return {
      agentId: defaultAgentId as AimAgentId, // undefined → 由调用方判定
      cleanedInput: text.trim(),
      via: "unknown",
    }
  }

  // 无命令
  if (defaultAgentId) {
    return {
      agentId: defaultAgentId as AimAgentId,
      cleanedInput: text.trim(),
      via: "default",
    }
  }

  return {
    agentId: undefined as unknown as AimAgentId,
    cleanedInput: text.trim(),
    via: "unknown",
  }
}

/** 返回所有可用的命令别名，用于给用户展示帮助文案。 */
export function listAimChannelCommands(): Array<{ agentId: AimAgentId; aliases: string[] }> {
  return COMMAND_ALIASES.map(({ agentId, aliases }) => ({ agentId, aliases }))
}

/** 生成一段帮助文案，列出所有可用命令。 */
export function buildAimChannelHelpText(): string {
  const lines = COMMAND_ALIASES.map(({ aliases }) => `/${aliases[0]}`)
  return [
    "在群里 @我 并用 /命令 指定智能体，例如：",
    ...lines.map((l) => `  ${l} 你的需求`),
    "",
    "可用智能体：内容创作、作品编辑、自由文案、灵感选题、商业诊断、发布前质检、人设故事。",
  ].join("\n")
}
