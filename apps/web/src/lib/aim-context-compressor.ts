// ─── AIM 上下文压缩器 ─────────────────────────────────────
//
// 在调用模型之前对长对话执行规则型压缩：
// - 最近 N 轮（4-6 轮）原文保留
// - 更早内容压缩成一条系统级摘要
// - 每个智能体有独立的保留重点

import type { ChatMessage } from "@/lib/llm/types"

// ─── 类型定义 ──────────────────────────────────────────────

export interface AimCompressedContext {
  /** 压缩后的 messages（已包含系统摘要 + 最近原文） */
  compressedMessages: ChatMessage[]
  /** 是否触发了压缩（方便日志/调试） */
  didCompress: boolean
  /** 保留的最近轮次数 */
  recentRounds: number
  /** 被压缩的早轮次摘要（纯文本） */
  summary: string
}

/** 智能体压缩策略 */
export interface AimCompressionProfile {
  /** 保留的最近消息轮次（含 assistant 回复） */
  recentRounds: number
  /** 摘要中应保留的关键字段描述（给规则引擎用的） */
  focus: string[]
  /** 压缩摘要上限字符数 */
  maxSummaryChars: number
}

// ─── 智能体压缩策略配置 ──────────────────────────────────

const COMPRESSION_PROFILES: Record<string, AimCompressionProfile> = {
  deep_copywriter: {
    recentRounds: 6,
    focus: [
      "用户的真实观点和态度",
      "用户对选项的选择",
      "用户分享的亲身经历和素材",
      "已确认的第一句话或前3秒钩子",
      "已定的大纲结构",
      "最后一版母稿内容",
      "用户的修改要求和方向调整",
    ],
    maxSummaryChars: 2000,
  },
  business_system_diagnosis: {
    recentRounds: 6,
    focus: [
      "业务事实和数据（行业、规模、阶段）",
      "用户表达的核心目标",
      "已确认的约束条件（资源、时间、团队）",
      "已找出的核心矛盾和瓶颈",
      "已排除的方向和诊断结论",
      "用户提供的具体案例和数据点",
    ],
    maxSummaryChars: 2000,
  },
  business_diagnosis: {
    recentRounds: 5,
    focus: [
      "已确定的人设方向",
      "定位主张和差异化",
      "目标用户画像",
      "成交路径和报价策略",
      "内容方向规划",
      "被否定的定位选项（不要作为当前结论）",
    ],
    maxSummaryChars: 2000,
  },
  content_producer: {
    recentRounds: 5,
    focus: [
      "用户选题和需求",
      "平台/渠道要求",
      "产品卖点和转化目标",
      "脚本结构和节拍安排",
      "CTA（行动引导）设计",
      "已生成的最后一版内容",
      "用户的修改反馈",
      "人设口吻要求",
    ],
    maxSummaryChars: 2000,
  },
  content_review: {
    recentRounds: 5,
    focus: [
      "待质检的成稿内容",
      "发布前自查结论",
      "平台风险和必改表达",
      "AI味、逻辑和文笔问题",
      "最小修改建议",
      "用户确认保留或删除的表达",
    ],
    maxSummaryChars: 2000,
  },
}

/** 默认压缩策略（未匹配到具体 agent 时的兜底） */
const DEFAULT_PROFILE: AimCompressionProfile = {
  recentRounds: 4,
  focus: [
    "用户核心诉求和目标",
    "已确认的关键信息",
    "已输出的结果",
    "用户反馈和修改方向",
  ],
  maxSummaryChars: 1500,
}

// ─── 辅助类型 ─────────────────────────────────────────────

interface MessageRole {
  role: "user" | "assistant"
  content: string
}

// ─── 核心函数 ─────────────────────────────────────────────

/**
 * 压缩 AIM 对话消息
 *
 * @param agentId 当前智能体 ID
 * @param messages 完整消息列表（前端保存的格式）
 * @returns 压缩后的上下文
 */
export function compressAimMessages(
  agentId: string,
  messages: MessageRole[]
): AimCompressedContext {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      compressedMessages: [],
      didCompress: false,
      recentRounds: 0,
      summary: "",
    }
  }

  const profile = COMPRESSION_PROFILES[agentId] ?? DEFAULT_PROFILE

  // 计算最近轮次：每轮 = 1 条 user + 1 条 assistant（或 2 条 user 连续)
  // 取最近的 recentRounds 轮
  const recentMessages = extractRecentMessages(messages, profile.recentRounds)
  const recentCount = recentMessages.length

  if (recentCount >= messages.length) {
    // 消息不够压缩阈值，不触发压缩
    return {
      compressedMessages: [],
      didCompress: false,
      recentRounds: profile.recentRounds,
      summary: "",
    }
  }

  // 对更早消息进行压缩
  const olderMessages = messages.slice(0, messages.length - recentCount)
  const summary = buildSummary(olderMessages, profile)

  return {
    compressedMessages: recentMessages,
    didCompress: true,
    recentRounds: profile.recentRounds,
    summary,
  }
}

/**
 * 构建最终上下文消息列表
 *
 * 顺序：系统提示词 → 压缩摘要（如触发） → 知识块（外部传入） → 最近原文
 *
 * @param systemPrompt 系统提示词
 * @param compressed 压缩上下文
 * @param knowledgeBlock RAG 知识块文本（已由 buildAimKnowledgeContext 生成）
 * @returns 完整的 ChatMessage[] 传给 LLM
 */
export function buildAimContextMessages(input: {
  systemPrompt: string
  compressed: AimCompressedContext
  knowledgeBlock: string
}): ChatMessage[] {
  const { systemPrompt, compressed, knowledgeBlock } = input
  const result: ChatMessage[] = [{ role: "system", content: systemPrompt }]

  // 2. 压缩摘要（如有）
  if (compressed.didCompress && compressed.summary) {
    result.push({
      role: "system",
      content: `【历史对话摘要】\n${compressed.summary}`,
    })
  }

  // 3. RAG 知识块
  if (knowledgeBlock) {
    result.push({
      role: "system",
      content: knowledgeBlock,
    })
  }

  // 4. 最近原文消息
  for (const msg of compressed.compressedMessages) {
    result.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    })
  }

  return result
}

// ─── 内部函数 ─────────────────────────────────────────────

/**
 * 提取最近 N 轮消息（按轮次计，不按消息条数计）
 * 一轮定义为：用户输入 + AI 回复
 */
function extractRecentMessages(
  messages: MessageRole[],
  rounds: number
): MessageRole[] {
  if (messages.length <= 1) return messages

  // 从后往前遍历，计数轮次
  let roundCount = 0
  let startIndex = messages.length - 1

  for (let i = messages.length - 1; i >= 0; i--) {
    if (roundCount >= rounds) break
    startIndex = i

    // 当遇到 user 消息时，说明完成了一轮（user + assistant 或单独 user）
    if (messages[i].role === "user") {
      roundCount++
    }
  }

  return messages.slice(startIndex)
}

/**
 * 构建规则型摘要
 *
 * 策略：
 * 1. 提取所有 user 消息中的关键句（问题、需求、数据、观点）
 * 2. 提取所有 assistant 消息中的关键结论
 * 3. 标记已被用户否定的内容
 * 4. 按 agent 保留重点组织
 * 5. 控制字符预算
 */
function buildSummary(
  messages: MessageRole[],
  profile: AimCompressionProfile
): string {
  const { focus, maxSummaryChars } = profile

  // 把 focus 列表作为上下文描述写入摘要前置说明
  let summary = `以下是对之前对话内容的摘要。重点包含：\n`
  summary += focus.map((f) => `- ${f}`).join("\n")
  summary += "\n（以下内容不保留：寒暄、重复确认、失败请求、无关闲聊、已被后续否定的旧方向）\n\n"

  // 逐条处理消息
  let summaryContent = ""
  let lastContent = ""

  for (const msg of messages) {
    const content = msg.content.trim()
    if (!content) continue

    // 检测否定性内容（用户否定了之前的输出）
    if (msg.role === "user" && /不[是行对要]|不对|不行|换一个|重新[来搞]|不[太很]满意|这个不行|方向不对|不是这个意思/i.test(content)) {
      summaryContent += `[用户否定了之前的方向]\n`
    }

    // 提取关键信息
    if (msg.role === "user") {
      // 用户消息：提取短句和具体信息
      const lines = content.split("\n").filter((l) => {
        const trimmed = l.trim()
        // 过滤寒暄、废话
        if (/^(你好|hi|hello|在吗|谢谢|[好的嗯是]+|[好嗯]的|[知道明白]+|没问题|[行好吧]的?[吧吗]?)$/i.test(trimmed)) return false
        if (/^[好嗯]的[，。!！]?$/.test(trimmed)) return false
        if (/^(可以|好的|明白了|收到|了解)[，。!！]?$/i.test(trimmed)) return false
        return trimmed.length > 4
      })

      if (lines.length > 0) {
        // 去重（相邻相同内容）
        const deduped = lines.filter((l) => l.trim() !== lastContent)
        if (deduped.length > 0) {
          summaryContent += `用户：${deduped.slice(0, 3).join(" | ")}\n`
          lastContent = deduped[deduped.length - 1]
        }
      }
    } else if (msg.role === "assistant") {
      // AI 回复：只保留关键输出，过滤寒暄
      const firstLine = content.split("\n")[0]?.trim()
      if (firstLine && firstLine.length > 10 && !/^(好的|明白了|我[知明]道了|让我|我先|我来)/.test(firstLine)) {
        // 检查是否与上一条 AI 回复内容相似（跳过重复结构）
        if (firstLine !== lastContent) {
          summaryContent += `AI：${firstLine.slice(0, 200)}\n`
          lastContent = firstLine
        }
      }
    }
  }

  // 控制字符预算
  if (summary.length + summaryContent.length > maxSummaryChars) {
    const available = maxSummaryChars - summary.length - 50 // 留余量
    if (available > 100) {
      summaryContent = summaryContent.slice(0, available) + "\n...（摘要已截断）\n"
    } else {
      summaryContent = "（摘要因预算限制已省略）\n"
    }
  }

  summary += summaryContent

  if (!summaryContent) {
    summary += "（历史对话无关键信息需要保留）\n"
  }

  return summary
}
