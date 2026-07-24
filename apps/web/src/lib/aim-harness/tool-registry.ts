/**
 * 内部 Tool Registry（14 周正本阶段 5 最小实现）。
 * 未注册或当前 RunSpec 未授权的工具一律拒绝。
 */

export type ToolPermissionLevel = "read" | "write" | "external" | "review"

export interface AimToolDefinition {
  name: string
  purpose: string
  forbiddenWhen: string
  permission: ToolPermissionLevel
  /** 是否允许进入模型自由选择的 BoundedToolLoop */
  allowInToolLoop: boolean
  timeoutMs: number
  idempotent: boolean
}

export const AIM_TOOL_REGISTRY: readonly AimToolDefinition[] = Object.freeze([
  {
    name: "search_project_knowledge",
    purpose: "检索当前项目知识库",
    forbiddenWhen: "跨项目、写操作、外发",
    permission: "read",
    allowInToolLoop: true,
    timeoutMs: 10_000,
    idempotent: true,
  },
  {
    name: "get_project_memories",
    purpose: "召回已批准的项目记忆",
    forbiddenWhen: "跨项目、召回 candidate/rejected",
    permission: "read",
    allowInToolLoop: true,
    timeoutMs: 10_000,
    idempotent: true,
  },
  {
    name: "read_aim_generation",
    purpose: "读取当前项目既有生成稿",
    forbiddenWhen: "跨项目",
    permission: "read",
    allowInToolLoop: true,
    timeoutMs: 10_000,
    idempotent: true,
  },
  {
    name: "read_work_item",
    purpose: "读取当前项目经营事项",
    forbiddenWhen: "跨项目、写状态",
    permission: "read",
    allowInToolLoop: true,
    timeoutMs: 10_000,
    idempotent: true,
  },
  {
    name: "request_human_review",
    purpose: "证据不足时转人工",
    forbiddenWhen: "作为外发通道",
    permission: "review",
    allowInToolLoop: true,
    timeoutMs: 3_000,
    idempotent: true,
  },
  {
    name: "deterministic_preflight",
    purpose: "Business Loop 输入校验",
    forbiddenWhen: "模型自由选择",
    permission: "read",
    allowInToolLoop: false,
    timeoutMs: 5_000,
    idempotent: true,
  },
  {
    name: "aim_harness",
    purpose: "Business Loop 调用 Harness 生成",
    forbiddenWhen: "模型自由选择副作用工具集",
    permission: "write",
    allowInToolLoop: false,
    timeoutMs: 120_000,
    idempotent: false,
  },
  {
    name: "asset_candidate_store",
    purpose: "写入待批准资产候选",
    forbiddenWhen: "直接写正式知识库",
    permission: "write",
    allowInToolLoop: false,
    timeoutMs: 15_000,
    idempotent: true,
  },
])

const BY_NAME = new Map(AIM_TOOL_REGISTRY.map((tool) => [tool.name, tool]))

export function getRegisteredTool(name: string): AimToolDefinition | null {
  return BY_NAME.get(name) ?? null
}

export function assertToolRegistered(name: string): AimToolDefinition {
  const tool = getRegisteredTool(name)
  if (!tool) {
    throw new Error(`工具未注册：${name}`)
  }
  return tool
}

export function assertToolAllowedInToolLoop(
  name: string,
  allowedToolNames?: readonly string[],
): AimToolDefinition {
  const tool = assertToolRegistered(name)
  if (!tool.allowInToolLoop) {
    throw new Error(`工具禁止进入 Tool Loop：${name}`)
  }
  if (allowedToolNames && !allowedToolNames.includes(name)) {
    throw new Error(`工具未被当前 RunSpec 授权：${name}`)
  }
  return tool
}

export function listToolLoopTools(): AimToolDefinition[] {
  return AIM_TOOL_REGISTRY.filter((tool) => tool.allowInToolLoop)
}
