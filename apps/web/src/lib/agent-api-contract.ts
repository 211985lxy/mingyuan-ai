import { AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { ContentFormat } from "@/lib/aim-generator"

export const AGENT_API_VERSION = "0.1.0"

export const AGENT_AIM_AGENT_IDS: AimAgentId[] = [
  "business_system_diagnosis",
  "business_diagnosis",
  "content_producer",
  "free_copywriter",
  "deep_copywriter",
  "content_review",
]

export const AGENT_TARGET_FORMATS: ContentFormat[] = [
  "video_script",
  "moments_post",
  "wechat_article",
  "community_message",
  "shooting_brief",
  "raw_copy",
]

export const AGENT_DENIED_ACTIONS = [
  "auto_publish",
  "feishu_sync",
  "knowledge_mutation",
  "project_mutation",
  "batch_long_running_tasks",
  "shell_or_webhook_execution",
]

const AGENT_KNOWLEDGE_IMPORT_DENIED_ACTIONS = AGENT_DENIED_ACTIONS
  .filter((action) => action !== "knowledge_mutation")
  .concat("unreviewed_knowledge_mutation", "knowledge_update_or_delete")

const TARGET_FORMAT_SET = new Set<string>(AGENT_TARGET_FORMATS)
const AGENT_AIM_AGENT_ID_SET = new Set<string>(AGENT_AIM_AGENT_IDS)

export function parseAgentTargetFormats(value: unknown): ContentFormat[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (format): format is ContentFormat =>
      typeof format === "string" && TARGET_FORMAT_SET.has(format)
  )
}

export function findInvalidAgentTargetFormats(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (format): format is string => typeof format === "string" && !TARGET_FORMAT_SET.has(format)
  )
}

export function summarizeAgentInput(input: string) {
  const trimmed = input.replace(/\s+/g, " ").trim()
  return trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed
}

export function buildAgentCapabilities() {
  return {
    name: "明动 AIM Agent Skill",
    version: AGENT_API_VERSION,
    mode: "draft_generation_only",
    authentication: "Authorization: Bearer maim_xxx",
    agents: AIM_AGENT_OPTIONS.filter((agent) => AGENT_AIM_AGENT_ID_SET.has(agent.id)).map(
      (agent) => ({
        id: agent.id,
        name: agent.title,
        description: agent.description,
        defaultFormats: agent.defaultFormats,
      })
    ),
    targetFormats: AGENT_TARGET_FORMATS,
    extraSkills: [
      {
        id: "wechat_chat_import",
        name: "微信聊天导入",
        description: "把微信/企微聊天导出文本整理成可确认入库的知识条目",
        previewEndpoint: "/api/agent/v1/knowledge/wechat-chat/import",
        confirmEndpoint: "/api/agent/v1/knowledge/wechat-chat/confirm",
      },
    ],
    boundaries: {
      allowed: ["generate_content_drafts", "create_confirmed_wechat_chat_knowledge"],
      denied: AGENT_KNOWLEDGE_IMPORT_DENIED_ACTIONS,
    },
  }
}
