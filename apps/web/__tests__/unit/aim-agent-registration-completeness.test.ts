import { describe, expect, it } from "vitest"
import { AGENT_AGENT_ALLOWLIST } from "@/app/api/account/agent-keys/route"
import { AGENT_AIM_AGENT_IDS } from "@/lib/agent-api-contract"
import { getAllAgentLogicProfiles } from "@/lib/agent-logic-profile"
import { AGENT_PRIORITY_CATEGORIES } from "@/lib/aim-knowledge-context"
import { COMPRESSION_PROFILES } from "@/lib/aim-context-compressor"
import { AIM_AGENT_CAPABILITIES } from "@/lib/aim/agent-capabilities"
import { AIM_AGENT_GUIDES } from "@/lib/aim-agent-guides"
import { listAimChannelCommands } from "@/lib/aim-channel-router"
import { AIM_AGENT_IDS, type AimAgentId } from "@/lib/aim-harness/contracts"
import { AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"
import { FEISHU_AGENT_ACK_REPLIES, FEISHU_AGENT_ROLE_CONSTRAINTS } from "@/lib/feishu-agent-persona"
import { FEISHU_AGENT_BOT_IDS } from "@/lib/feishu-agent-registry"
import { AGENT_ROUTES } from "@/lib/llm/agent-router"

type RegistrationTable = {
  file: string
  table: string
  actualIds: readonly string[]
  exemptions?: Partial<Record<AimAgentId, string>>
}

const AIM_AGENT_ID_LIST = [...AIM_AGENT_IDS]
const AIM_AGENT_ID_SET = new Set<string>(AIM_AGENT_ID_LIST)

const REGISTRATION_TABLES: RegistrationTable[] = [
  {
    file: "src/lib/aim-ui-config.ts",
    table: "AIM_AGENT_OPTIONS",
    actualIds: AIM_AGENT_OPTIONS.map((agent) => agent.id),
  },
  {
    file: "src/lib/aim-agent-guides.ts",
    table: "AIM_AGENT_GUIDES",
    actualIds: Object.keys(AIM_AGENT_GUIDES),
  },
  {
    file: "src/lib/aim/agent-capabilities.ts",
    table: "AIM_AGENT_CAPABILITIES",
    actualIds: Object.keys(AIM_AGENT_CAPABILITIES),
  },
  {
    file: "src/lib/agent-logic-profile.ts",
    table: "AGENT_KNOWLEDGE_CATEGORIES / AGENT_MODEL_CHAINS / AGENT_METHODOLOGIES / AGENT_OTHER_CONTEXT",
    actualIds: getAllAgentLogicProfiles().map((profile) => profile.agentId),
  },
  {
    file: "src/lib/aim-channel-router.ts",
    table: "COMMAND_ALIASES",
    actualIds: listAimChannelCommands().map((command) => command.agentId),
  },
  {
    file: "src/lib/llm/agent-router.ts",
    table: "AGENT_ROUTES",
    actualIds: Object.keys(AGENT_ROUTES),
  },
  {
    file: "src/lib/aim-knowledge-context.ts",
    table: "AGENT_PRIORITY_CATEGORIES",
    actualIds: Object.keys(AGENT_PRIORITY_CATEGORIES),
    exemptions: {
      persona: "人设故事没有专属知识排序，使用默认的定位、老板经历、痛点和案例优先级。",
    },
  },
  {
    file: "src/lib/aim-context-compressor.ts",
    table: "COMPRESSION_PROFILES",
    actualIds: Object.keys(COMPRESSION_PROFILES),
    exemptions: {
      free_copywriter: "自由文案没有固定交付物，使用通用摘要重点，避免把创作限制成预设模板。",
      persona: "人设故事依赖追问过程，使用通用摘要重点，避免预先丢掉用户故事线索。",
    },
  },
  {
    file: "src/lib/agent-api-contract.ts",
    table: "AGENT_AIM_AGENT_IDS",
    actualIds: AGENT_AIM_AGENT_IDS,
    exemptions: {
      persona: "人设故事需要在控制台里持续追问和确认，不开放给只负责单次草稿交付的对外 Agent API。",
    },
  },
  {
    file: "src/app/api/account/agent-keys/route.ts",
    table: "AGENT_AGENT_ALLOWLIST",
    actualIds: AGENT_AGENT_ALLOWLIST,
    exemptions: {
      persona: "API Key 只允许调用对外 Agent API 已开放的智能体；人设故事不在该 API 的单次草稿范围内。",
    },
  },
  {
    file: "src/lib/feishu-agent-registry.ts",
    table: "FEISHU_AGENT_BOT_IDS",
    actualIds: FEISHU_AGENT_BOT_IDS,
    exemptions: {
      free_copywriter: "自由文案没有独立飞书机器人和凭证前缀，保持在现有机器人内通过命令调用。",
      content_retro: "数据复盘尚未配置独立飞书应用及环境变量；注册空凭证机器人会让入口看似可用却无法验签。",
    },
  },
  {
    file: "src/lib/feishu-agent-persona.ts",
    table: "FEISHU_AGENT_ACK_REPLIES / FEISHU_AGENT_ROLE_CONSTRAINTS",
    actualIds: [...new Set([
      ...Object.keys(FEISHU_AGENT_ACK_REPLIES),
      ...Object.keys(FEISHU_AGENT_ROLE_CONSTRAINTS),
    ])],
    exemptions: {
      free_copywriter: "自由文案没有独立飞书机器人，所以不需要独立确认话术和角色约束。",
      content_retro: "数据复盘没有独立飞书机器人，不能只补话术而没有可验签的机器人配置。",
    },
  },
]

function collectExemptionProblems(table: RegistrationTable): string[] {
  return Object.entries(table.exemptions ?? {}).flatMap(([agentId, reason]) => {
    if (!AIM_AGENT_ID_SET.has(agentId)) {
      return [`豁免表中的智能体 ${agentId} 不是合法 AimAgentId。`]
    }
    if (!reason.trim()) {
      return [`豁免表中的智能体 ${agentId} 没有写明理由。`]
    }
    if (table.actualIds.includes(agentId)) {
      return [`智能体 ${agentId} 已在 ${table.file} 的 ${table.table} 里配置，必须从豁免表移除。`]
    }
    return []
  })
}

function collectMissingEntries(table: RegistrationTable): string[] {
  const exemptedIds = new Set(Object.keys(table.exemptions ?? {}))
  return AIM_AGENT_ID_LIST
    .filter((agentId) => !table.actualIds.includes(agentId) && !exemptedIds.has(agentId))
    .map(
      (agentId) =>
        `智能体 ${agentId} 在 ${table.file} 的 ${table.table} 里缺少条目；如果是故意的，请加进本测试的豁免表并写明理由。`
    )
}

describe("AIM 智能体注册完整性", () => {
  it("规范 id 集合不包含重复项", () => {
    expect(AIM_AGENT_ID_LIST).toEqual([...new Set(AIM_AGENT_ID_LIST)])
  })

  it.each(REGISTRATION_TABLES)(
    "$file 的 $table 必须覆盖每个智能体，或有明确豁免",
    (table) => {
      expect(collectExemptionProblems(table)).toEqual([])
      expect(collectMissingEntries(table)).toEqual([])
    }
  )

  it("数据复盘后台镜像与真实模型链、知识优先级一致", () => {
    const profile = getAllAgentLogicProfiles().find(({ agentId }) => agentId === "content_retro")

    expect(profile).toBeDefined()
    expect(profile?.knowledgeCategories.map(({ key }) => key)).toEqual(
      AGENT_PRIORITY_CATEGORIES.content_retro
    )
    expect(profile?.modelChain.map(({ provider }) => provider)).toEqual(
      AGENT_ROUTES.content_retro.map(({ name }) => name)
    )
    expect(profile?.methodologies).toEqual([])
    expect(profile?.otherContextSources).toEqual([
      "已登记发布数据（ContentOutcome）",
      "AIM 长期记忆",
    ])
  })
})
