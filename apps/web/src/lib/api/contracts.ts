import { z, type ZodType } from "zod"

import { ApiRequestError, parseJsonBody } from "@/lib/api-contract"

/**
 * 能力 API 契约注册表（Step② 能力 API 契约收敛）。
 *
 * 目标：把「可被对话轴编排的能力路由」与其 zod 输入契约集中登记，
 * 与 `docs/architecture/api-inventory.json`（文档层，scripts/api-inventory.mjs 生成）
 * 形成两层契约：本文件是运行时权威，inventory 是全量归类的文档快照。
 *
 * 约定：
 - `kind`: capability=能力型（LLM/分析等可编排产出）；management=管理/后台型；crud=资源增删改查型。
 * - `orchestratable`: 是否允许被对话轴（Step③ HITL gate / 意图路由）编排调用。
 *   管理面（admin 域）一律 false。
 * - 能力型路由新增时必须先在本表登记，再用 `parseCapabilityInput` 消费请求体。
 */

export type CapabilityKind = "capability" | "management" | "crud"

export interface CapabilityContract {
  /** 路由路径（与 api-inventory.json 的 route 字段一致）。 */
  route: string
  /** 业务域归类：aim / competitor / brief / knowledge / voice … */
  domain: string
  kind: CapabilityKind
  /** 是否可被对话轴编排调用。 */
  orchestratable: boolean
  /** 鉴权方式（与 inventory 的 auth 词表一致）。 */
  auth: "user_session" | "admin_session" | "agent_key" | "cron_secret" | "signed_integration"
  description: string
  /** zod 输入契约。 */
  inputSchema: ZodType
}

// ── 首批能力路由输入契约 ──────────────────────────────────────────────────

export const BRIEF_AI_FILL_INPUT = z
  .object({
    templateId: z.string().trim().min(1, "templateId is required"),
    userInput: z.string().max(20_000).optional().default(""),
  })
  .strict()

export const KNOWLEDGE_DISTILL_INPUT = z
  .object({
    ids: z.array(z.string().min(1)).min(1, "ids 必填且最多 50 条").max(50, "ids 必填且最多 50 条"),
  })
  .strict()

export const SEARCH_CHANNELS_ANALYZE_INPUT = z
  .object({
    keyword: z.string().trim().min(1).max(200),
    count: z.number().int().min(5).max(50).default(20),
  })
  .strict()

export const METHODOLOGY_COMPILE_INPUT = z
  .object({
    competitorAnalysisText: z.string().trim().min(1, "competitorAnalysisText is required").max(100_000),
    projectName: z.string().max(200).optional(),
    sourceCompetitorId: z.string().max(80).optional(),
  })
  .strict()

// ── 注册表 ────────────────────────────────────────────────────────────────

export const CAPABILITY_CONTRACTS: readonly CapabilityContract[] = [
  {
    route: "/api/brief/ai-fill",
    domain: "brief",
    kind: "capability",
    orchestratable: true,
    auth: "user_session",
    description: "Brief 表单智能填写：根据用户描述与 IP 档案推测表单字段（LLM）",
    inputSchema: BRIEF_AI_FILL_INPUT,
  },
  {
    route: "/api/admin/knowledge/distill",
    domain: "knowledge",
    kind: "capability",
    orchestratable: false,
    auth: "admin_session",
    description: "知识库蒸馏：对指定知识条目做精炼/合并/分类建议（LLM，管理面触发）",
    inputSchema: KNOWLEDGE_DISTILL_INPUT,
  },
  {
    route: "/api/competitor/search-channels/analyze",
    domain: "competitor",
    kind: "capability",
    orchestratable: true,
    auth: "user_session",
    description: "视频号选题热度分析：搜索 + AI 选题热度报告（LLM）",
    inputSchema: SEARCH_CHANNELS_ANALYZE_INPUT,
  },
  {
    route: "/api/competitor-analysis/methodology/compile",
    domain: "competitor",
    kind: "capability",
    orchestratable: true,
    auth: "user_session",
    description: "竞品分析编译为项目爆款策略文档（LLM）",
    inputSchema: METHODOLOGY_COMPILE_INPUT,
  },
]

const contractByRoute = new Map(CAPABILITY_CONTRACTS.map((contract) => [contract.route, contract]))

/**
 * @description 查询能力契约
 * @param route - 路由路径
 * @returns 契约；未登记返回 undefined
 */
export function getCapabilityContract(route: string): CapabilityContract | undefined {
  return contractByRoute.get(route)
}

/**
 * @description 按能力契约解析请求体（zod 校验失败抛 400 ApiRequestError）
 * @param route - 路由路径
 * @param request - Request
 * @param options - parseJsonBody 选项（如 maxBytes）
 * @returns 解析并校验后的输入
 */
export async function parseCapabilityInput(
  route: string,
  request: Request,
  options: { maxBytes?: number } = {},
): Promise<unknown> {
  const contract = contractByRoute.get(route)
  if (!contract) {
    throw new ApiRequestError(500, "CAPABILITY_NOT_REGISTERED", `Capability contract missing for ${route}`)
  }
  return parseJsonBody(request, contract.inputSchema, options)
}
