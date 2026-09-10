/**
 * BoundedToolLoop L0 感知工具（只读 / 请求人工）。
 * 正本：项目知识 / 记忆 / 生成稿 / 经营事项 / 转人工；
 * 灰度：FEISHU_KNOWLEDGE_ENABLED 打开后加入飞书知识检索与文档阅读。
 */

import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import { buildAimKnowledgeContext } from "@/lib/aim-knowledge-context"
import { retrieveAimMemory } from "@/lib/aim-memory"
import {
  isFeishuKnowledgeEnabled,
  parseWikiSpaceIds,
} from "@/lib/integrations/feishu-knowledge-client"
import {
  executeFeishuKnowledgeTool,
  type FeishuKnowledgeToolConfig,
} from "@/lib/integrations/feishu-knowledge-tool"
import { assertToolAllowedInToolLoop } from "./tool-registry"

export const CORE_BOUND_TOOL_LOOP_TOOL_NAMES = [
  "search_project_knowledge",
  "get_project_memories",
  "read_aim_generation",
  "read_work_item",
  "request_human_review",
] as const

export const FEISHU_KNOWLEDGE_TOOL_NAMES = [
  "feishu_knowledge_search",
  "feishu_doc_read",
] as const

export const BOUND_TOOL_LOOP_TOOL_NAMES = [
  ...CORE_BOUND_TOOL_LOOP_TOOL_NAMES,
  ...FEISHU_KNOWLEDGE_TOOL_NAMES,
] as const

export type BoundToolLoopToolName = (typeof BOUND_TOOL_LOOP_TOOL_NAMES)[number]

export interface BoundToolLoopToolContext {
  userId: string
  projectId?: string
  rawInput: string
  allowedToolNames?: readonly string[]
  feishuKnowledge?: FeishuKnowledgeToolConfig
}

export function listActiveBoundToolLoopToolNames(
  enabled = isFeishuKnowledgeEnabled(env.FEISHU_KNOWLEDGE_ENABLED),
): readonly BoundToolLoopToolName[] {
  return enabled ? BOUND_TOOL_LOOP_TOOL_NAMES : CORE_BOUND_TOOL_LOOP_TOOL_NAMES
}

async function withToolTimeout<T>(promise: Promise<T>, timeoutMs: number, name: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`工具超时：${name} > ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * @description 执行有界工具环中的单个工具（只读；禁止跨项目；须注册且授权）
 */
export async function executeBoundToolLoopTool(
  name: BoundToolLoopToolName,
  args: Record<string, unknown>,
  ctx: BoundToolLoopToolContext,
): Promise<string> {
  const def = assertToolAllowedInToolLoop(name, ctx.allowedToolNames ?? listActiveBoundToolLoopToolNames())
  return withToolTimeout(executeToolBody(name, args, ctx), def.timeoutMs, name)
}

async function executeToolBody(
  name: BoundToolLoopToolName,
  args: Record<string, unknown>,
  ctx: BoundToolLoopToolContext,
): Promise<string> {
  switch (name) {
    case "search_project_knowledge": {
      if (!ctx.projectId) return "无项目，无法检索知识库。"
      const query =
        typeof args.query === "string" && args.query.trim()
          ? args.query.trim()
          : ctx.rawInput.slice(0, 500)
      const result = await buildAimKnowledgeContext({
        userId: ctx.userId,
        projectId: ctx.projectId,
        agentId: typeof args.agentId === "string" ? args.agentId : "content_producer",
        query,
      })
      if (!result.knowledgeBlock.trim()) return "知识库未命中相关条目。"
      return result.knowledgeBlock.slice(0, 3500)
    }
    case "get_project_memories": {
      if (!ctx.projectId) return "无项目，无法召回记忆。"
      const rows = await retrieveAimMemory({
        userId: ctx.userId,
        projectId: ctx.projectId,
        topK: 8,
      })
      if (!rows.length) return "暂无可用长期记忆。"
      return rows
        .map((row) => `（${row.kind}）${row.content}`)
        .join("\n")
        .slice(0, 2500)
    }
    case "read_aim_generation": {
      if (!ctx.projectId) return "无项目，无法读取生成稿。"
      const id = typeof args.id === "string" ? args.id.trim() : ""
      if (!id) return "缺少 generation id。"
      const row = await prisma.aimGeneration.findFirst({
        where: { id, userId: ctx.userId, projectId: ctx.projectId },
        select: {
          id: true,
          agentId: true,
          rawInput: true,
          videoScript: true,
          wechatArticle: true,
          momentsPost: true,
          communityMessage: true,
          rawCopy: true,
          createdAt: true,
        },
      })
      if (!row) return "未找到当前项目内的生成稿（禁止跨项目读取）。"
      const drafts = [
        row.videoScript && `video_script:\n${row.videoScript}`,
        row.wechatArticle && `wechat_article:\n${row.wechatArticle}`,
        row.momentsPost && `moments_post:\n${row.momentsPost}`,
        row.communityMessage && `community_message:\n${row.communityMessage}`,
        row.rawCopy && `raw_copy:\n${row.rawCopy}`,
      ].filter(Boolean).join("\n\n")
      return `generation=${row.id} agent=${row.agentId ?? ""}\ninput=${row.rawInput.slice(0, 500)}\n${drafts.slice(0, 2500)}`
    }
    case "read_work_item": {
      const id = typeof args.id === "string" ? args.id.trim() : ""
      if (!id) return "缺少 work item id。"
      try {
        const { createLarkWorkItemStore, readWorkItemStoreConfig } = await import(
          "@/lib/aim/work-item-store"
        )
        const { parseFeishuWorkItem } = await import("@/lib/aim-feishu-work-item")
        const store = createLarkWorkItemStore(readWorkItemStoreConfig())
        const record = await store.get(id)
        if (!record) return "未找到经营事项。"
        const parsed = parseFeishuWorkItem(record.fields)
        if (ctx.projectId && parsed.aimProjectId && parsed.aimProjectId !== ctx.projectId) {
          return "禁止跨项目读取经营事项。"
        }
        return [
          `workItem=${record.recordId}`,
          `status=${parsed.status}`,
          `workflow=${parsed.workflow}`,
          `project=${parsed.aimProjectId}`,
          parsed.resultSummary.slice(0, 2000) || parsed.inputContent.slice(0, 2000),
        ].join("\n")
      } catch (error) {
        return `经营事项读取不可用：${error instanceof Error ? error.message : String(error)}`
      }
    }
    case "request_human_review": {
      const reason =
        typeof args.reason === "string" && args.reason.trim()
          ? args.reason.trim()
          : "信息不足，需要人工补充。"
      return `已请求人工审核：${reason}`
    }
    case "feishu_knowledge_search":
    case "feishu_doc_read":
      return executeFeishuKnowledgeTool(name, args, ctx.feishuKnowledge ?? feishuKnowledgeConfigFromEnv())
    default:
      return `未知工具：${String(name)}`
  }
}

function feishuKnowledgeConfigFromEnv(): FeishuKnowledgeToolConfig {
  return {
    enabled: isFeishuKnowledgeEnabled(env.FEISHU_KNOWLEDGE_ENABLED),
    appId: env.FEISHU_APP_ID,
    appSecret: env.FEISHU_APP_SECRET,
    wikiSpaceIds: parseWikiSpaceIds(env.FEISHU_KNOWLEDGE_WIKI_SPACE_IDS),
    encryptionKey: env.FEISHU_TOKEN_ENCRYPTION_KEY,
  }
}
