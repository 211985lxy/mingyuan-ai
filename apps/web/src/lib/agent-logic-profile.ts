/**
 * 智能体逻辑档案数据源（后台「IP 操盘方法论」板块的只读真实数据）。
 *
 * 这里的数据如实描述每个智能体在执行时的真实行为：
 *  - 调用哪些知识分类及优先级（镜像 aim-knowledge-context.ts 的 AGENT_PRIORITY_CATEGORIES）
 *  - 使用哪些模型通道及顺序（镜像 llm/agent-router.ts 的 AGENT_ROUTES）
 *  - 加载哪份方法论（镜像 aim-agent-handlers.ts 的分支逻辑）
 *  - 还会用到哪些其他知识源（爆款结构库/竞品编译等，只读说明）
 *
 * 这些是「展示用」的规范化副本，不参与执行——避免把执行代码的内部常量
 * 直接 export 造成耦合。执行逻辑变更时，这里需同步更新（已在注释标注来源文件）。
 */
import type { AimAgentId } from "@/lib/aim-ui-config"
import { AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"
import { AIM_AGENT_GUIDES, type AimAgentGuide } from "@/lib/aim-agent-guides"
import type { MethodologyKey } from "@/lib/agent-methodology-store"
import { CATEGORY_LABELS as KNOWLEDGE_CATEGORY_LABELS } from "@/lib/knowledge-categories"

/** 模型/通道中文名（镜像 llm/config.ts 的 provider 名） */
export const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek（官方直连）",
  jiekou: "JieKou 中转",
  openrouter: "OpenRouter（国产模型池）",
  therouter: "TheRouter",
  glm: "智谱 GLM",
  lihuo: "离火 GPT-5.5",
}

/** 单个智能体的逻辑档案 */
export interface AgentLogicProfile {
  agentId: AimAgentId
  title: string
  description: string
  /** 调用的知识分类（按优先级排序，最高在前） */
  knowledgeCategories: Array<{ key: string; label: string }>
  /** 应用的方法论（可空，来自 handlers.ts 分支） */
  methodologies: Array<{ key: MethodologyKey; label: string; note?: string }>
  /** 模型通道链（主 → 备，来自 agent-router.ts AGENT_ROUTES） */
  modelChain: Array<{ provider: string; label: string }>
  /** 其他会注入的知识源（只读说明，不可编辑） */
  otherContextSources: string[]
  /** 该智能体的展示文案（来自 guide，可在后台编辑覆盖） */
  guide: AimAgentGuide
}

/**
 * 各智能体调用的知识分类优先级。
 * 来源：src/lib/aim-knowledge-context.ts AGENT_PRIORITY_CATEGORIES（persona 走 DEFAULT 兜底）。
 */
const AGENT_KNOWLEDGE_CATEGORIES: Record<AimAgentId, string[]> = {
  content_producer: ["user_insight", "product_usp", "project_case", "private_domain_material", "hot_topic", "benchmark_reference"],
  free_copywriter: ["user_insight", "product_usp", "project_case", "benchmark_reference"],
  deep_copywriter: ["boss_experience", "product_usp", "user_insight", "benchmark_reference", "positioning_material"],
  business_diagnosis: ["user_insight", "positioning_material", "boss_experience", "product_usp", "customer_pain"],
  business_system_diagnosis: ["product_usp", "customer_pain", "project_case", "customer_qa", "user_insight"],
  content_review: ["project_case", "benchmark_reference", "user_insight", "hot_topic"],
  // persona 未在 AGENT_PRIORITY_CATEGORIES 中显式配置，走 DEFAULT_PRIORITY_CATEGORIES 兜底
  persona: ["product_usp", "boss_experience", "customer_pain", "project_case"],
}

/**
 * 各智能体使用的模型通道链。
 * 来源：src/lib/llm/agent-router.ts AGENT_ROUTES。
 */
const AGENT_MODEL_CHAINS: Record<AimAgentId, string[]> = {
  content_producer: ["deepseek", "openrouter", "jiekou", "glm"],
  free_copywriter: ["deepseek", "openrouter", "jiekou", "glm"],
  deep_copywriter: ["lihuo", "openrouter", "openrouter", "deepseek", "jiekou", "therouter", "glm"],
  business_diagnosis: ["lihuo", "openrouter", "openrouter", "deepseek", "jiekou", "therouter", "glm"],
  business_system_diagnosis: ["deepseek", "openrouter", "openrouter", "jiekou", "glm"],
  content_review: ["deepseek", "openrouter", "openrouter", "jiekou", "glm"],
  persona: ["deepseek", "openrouter", "openrouter", "jiekou", "glm"],
}

/**
 * 各智能体应用的方法论。
 * 来源：src/lib/aim-agent-handlers.ts（IP操盘方法论 5 个智能体共用；商业诊断仅 bsd；事件方法论仅 cp/dc 特定场景）。
 */
const AGENT_METHODOLOGIES: Record<AimAgentId, Array<{ key: MethodologyKey; label: string; note?: string }>> = {
  content_producer: [
    { key: "ip_copywriting", label: "IP 操盘方法论" },
    { key: "event_storytelling", label: "事件内容化方法论", note: "仅现场/事件复盘类内容时按需注入" },
  ],
  free_copywriter: [],
  deep_copywriter: [
    { key: "ip_copywriting", label: "IP 操盘方法论" },
    { key: "event_storytelling", label: "事件内容化方法论", note: "仅现场/事件复盘类内容时按需注入" },
  ],
  business_diagnosis: [{ key: "ip_copywriting", label: "IP 操盘方法论" }],
  business_system_diagnosis: [
    { key: "ip_copywriting", label: "IP 操盘方法论" },
    { key: "business_diagnosis", label: "商业诊断方法论" },
  ],
  content_review: [{ key: "ip_copywriting", label: "IP 操盘方法论" }],
  persona: [{ key: "ip_copywriting", label: "IP 操盘方法论" }],
}

/** 各智能体额外注入的知识源（只读说明，镜像 handlers.ts / chat route 的上下文装配） */
const AGENT_OTHER_CONTEXT: Record<AimAgentId, string[]> = {
  content_producer: ["爆款结构库（开头/结构/结尾，来自内容模板）", "写作风格档案", "AIM 长期记忆", "IP Wiki", "编辑器上下文"],
  free_copywriter: ["写作风格档案", "AIM 长期记忆", "IP Wiki", "编辑器上下文"],
  deep_copywriter: ["爆款结构库", "写作风格档案", "AIM 长期记忆", "IP Wiki"],
  business_diagnosis: ["竞品观察（watchAccount）", "写作风格档案", "AIM 长期记忆", "IP Wiki", "对标视频拆解"],
  business_system_diagnosis: ["写作风格档案", "AIM 长期记忆", "IP Wiki"],
  content_review: ["写作风格档案", "AIM 长期记忆"],
  persona: ["写作风格档案", "AIM 长期记忆"],
}

/** 构建单个智能体的逻辑档案 */
export function getAgentLogicProfile(agentId: AimAgentId): AgentLogicProfile {
  const meta = AIM_AGENT_OPTIONS.find((a) => a.id === agentId)!
  const guide = AIM_AGENT_GUIDES[agentId]

  const knowledgeCategories = (AGENT_KNOWLEDGE_CATEGORIES[agentId] ?? []).map((key) => ({
    key,
    label: KNOWLEDGE_CATEGORY_LABELS[key] ?? key,
  }))

  const modelChain = (AGENT_MODEL_CHAINS[agentId] ?? []).map((provider) => ({
    provider,
    label: PROVIDER_LABELS[provider] ?? provider,
  }))

  return {
    agentId,
    title: meta.title,
    description: meta.description,
    knowledgeCategories,
    methodologies: AGENT_METHODOLOGIES[agentId] ?? [],
    modelChain,
    otherContextSources: AGENT_OTHER_CONTEXT[agentId] ?? [],
    guide,
  }
}

/** 全部智能体逻辑档案（档案页/拓扑图用） */
export function getAllAgentLogicProfiles(): AgentLogicProfile[] {
  return AIM_AGENT_OPTIONS.map((a) => getAgentLogicProfile(a.id))
}

/**
 * 智能体调用流程（拓扑图边）。
 * 来源：aim-agent-guides.ts 各 nextActions 里的 targetAgentId（智能体间跳转）。
 */
export interface AgentFlowEdge {
  from: AimAgentId
  to: AimAgentId
  label: string
}

export function getAgentFlowEdges(): AgentFlowEdge[] {
  const edges: AgentFlowEdge[] = []
  const seen = new Set<string>()
  for (const agentId of Object.keys(AIM_AGENT_GUIDES) as AimAgentId[]) {
    const guide = AIM_AGENT_GUIDES[agentId]
    for (const action of guide.nextActions) {
      if (action.targetAgentId) {
        const key = `${agentId}->${action.targetAgentId}`
        if (!seen.has(key)) {
          seen.add(key)
          edges.push({ from: agentId, to: action.targetAgentId, label: action.label })
        }
      }
    }
  }
  return edges
}
