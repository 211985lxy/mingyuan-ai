/**
 * MCP 远程调用端口（WP-8）。
 *
 * 在黄金链路稳定后，通过 Vercel mcp-handler 暴露 5 个业务端口。
 * 不暴露任意 lark-cli 执行权。
 *
 * 端口列表：
 * 1. create_artifact — 创建飞书资产（Doc/Base/Sheet/Drive）
 * 2. query_artifact — 查询资产状态和 Receipt
 * 3. update_artifact — 更新已有资产（阶段感知）
 * 4. list_project_assets — 列出项目下所有资产
 * 5. verify_artifact — 回读验证资产完整性
 *
 * 安全约束：
 * - 每个端口有严格的输入 schema 校验
 * - 不接受任意 CLI 命令
 * - 不接受任意文件路径（只接受预定义目录下的文件）
 * - 所有操作记录 Trace
 */
import type {
  AimArtifactSpec,
  FeishuAssetReceipt,
  FeishuAssetKind,
  ArtifactRole,
  PermissionProfile,
} from "@/lib/aim/artifacts/contracts"
import { buildArtifactKey, computeContentHash } from "@/lib/aim/artifacts/contracts"

// ─── MCP Tool 定义 ───────────────────────────────────────────────────────────

export interface McpToolDefinition {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpToolResult {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

// ─── 端口 1: create_artifact ─────────────────────────────────────────────────

export const CREATE_ARTIFACT_TOOL: McpToolDefinition = {
  name: "create_artifact",
  description: "创建飞书资产（Doc/Base记录/Sheet/Drive文件）。需要提供资产类型、标题、内容和项目ID。",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["feishu_doc", "feishu_base_records", "feishu_sheet", "feishu_drive_file"],
        description: "资产类型",
      },
      title: { type: "string", description: "资产标题" },
      projectId: { type: "string", description: "所属项目 ID" },
      workItemRecordId: { type: "string", description: "关联经营事项记录 ID" },
      content: { type: "string", description: "资产内容（Markdown 或 JSON）" },
      role: {
        type: "string",
        enum: ["primary", "secondary"],
        description: "资产角色（默认 primary）",
      },
      permissionProfile: {
        type: "string",
        enum: ["internal", "project_team", "client_delivery"],
        description: "权限配置（默认 internal）",
      },
    },
    required: ["kind", "title", "projectId", "workItemRecordId", "content"],
  },
}

// ─── 端口 2: query_artifact ──────────────────────────────────────────────────

export const QUERY_ARTIFACT_TOOL: McpToolDefinition = {
  name: "query_artifact",
  description: "查询资产状态和 Receipt。通过 artifactKey 或 generationId 查询。",
  inputSchema: {
    type: "object",
    properties: {
      artifactKey: { type: "string", description: "资产唯一键" },
      generationId: { type: "string", description: "生成结果 ID" },
      projectId: { type: "string", description: "项目 ID（可选过滤）" },
    },
  },
}

// ─── 端口 3: update_artifact ─────────────────────────────────────────────────

export const UPDATE_ARTIFACT_TOOL: McpToolDefinition = {
  name: "update_artifact",
  description: "更新已有飞书资产。遵循阶段感知更新策略（不覆盖人工编辑）。",
  inputSchema: {
    type: "object",
    properties: {
      artifactKey: { type: "string", description: "资产唯一键" },
      docToken: { type: "string", description: "文档 token" },
      newContent: { type: "string", description: "新内容" },
      stage: {
        type: "string",
        enum: ["draft", "pending_review", "completed", "human_edited"],
        description: "当前经营事项阶段",
      },
    },
    required: ["artifactKey", "newContent", "stage"],
  },
}

// ─── 端口 4: list_project_assets ─────────────────────────────────────────────

export const LIST_PROJECT_ASSETS_TOOL: McpToolDefinition = {
  name: "list_project_assets",
  description: "列出项目下所有已落地的飞书资产。",
  inputSchema: {
    type: "object",
    properties: {
      projectId: { type: "string", description: "项目 ID" },
      kind: {
        type: "string",
        enum: ["feishu_doc", "feishu_base_records", "feishu_sheet", "feishu_drive_file"],
        description: "按资产类型过滤（可选）",
      },
    },
    required: ["projectId"],
  },
}

// ─── 端口 5: verify_artifact ─────────────────────────────────────────────────

export const VERIFY_ARTIFACT_TOOL: McpToolDefinition = {
  name: "verify_artifact",
  description: "回读验证资产完整性。检查飞书资产是否可访问且内容完整。",
  inputSchema: {
    type: "object",
    properties: {
      artifactKey: { type: "string", description: "资产唯一键" },
      token: { type: "string", description: "飞书资产 token" },
      kind: {
        type: "string",
        enum: ["feishu_doc", "feishu_base_records", "feishu_sheet", "feishu_drive_file"],
        description: "资产类型",
      },
    },
    required: ["token", "kind"],
  },
}

// ─── 所有工具列表 ────────────────────────────────────────────────────────────

export const MCP_TOOLS: McpToolDefinition[] = [
  CREATE_ARTIFACT_TOOL,
  QUERY_ARTIFACT_TOOL,
  UPDATE_ARTIFACT_TOOL,
  LIST_PROJECT_ASSETS_TOOL,
  VERIFY_ARTIFACT_TOOL,
]

// ─── 输入校验 ────────────────────────────────────────────────────────────────

const VALID_KINDS: Set<string> = new Set([
  "feishu_doc", "feishu_base_records", "feishu_sheet", "feishu_drive_file",
])

const VALID_STAGES: Set<string> = new Set([
  "draft", "pending_review", "completed", "human_edited",
])

/**
 * 校验 create_artifact 输入。
 * 返回错误消息或 null（通过）。
 */
export function validateCreateArtifactInput(input: Record<string, unknown>): string | null {
  if (!input.kind || !VALID_KINDS.has(String(input.kind))) {
    return `无效的资产类型：${input.kind}。允许：${[...VALID_KINDS].join(", ")}`
  }
  if (!input.title || typeof input.title !== "string" || !input.title.trim()) {
    return "缺少有效的 title"
  }
  if (!input.projectId || typeof input.projectId !== "string") {
    return "缺少有效的 projectId"
  }
  if (!input.workItemRecordId || typeof input.workItemRecordId !== "string") {
    return "缺少有效的 workItemRecordId"
  }
  if (!input.content || typeof input.content !== "string") {
    return "缺少有效的 content"
  }
  return null
}

/**
 * 校验 update_artifact 输入。
 */
export function validateUpdateArtifactInput(input: Record<string, unknown>): string | null {
  if (!input.artifactKey || typeof input.artifactKey !== "string") {
    return "缺少有效的 artifactKey"
  }
  if (!input.newContent || typeof input.newContent !== "string") {
    return "缺少有效的 newContent"
  }
  if (!input.stage || !VALID_STAGES.has(String(input.stage))) {
    return `无效的阶段：${input.stage}。允许：${[...VALID_STAGES].join(", ")}`
  }
  return null
}

// ─── MCP Handler 路由（供 API route 调用）─────────────────────────────────────

export type McpToolHandler = (
  args: Record<string, unknown>,
) => Promise<McpToolResult>

/**
 * 创建 MCP 工具处理器映射。
 * 实际业务逻辑由注入的 service 提供。
 */
export function createMcpToolHandlers(services: {
  createArtifact: (spec: AimArtifactSpec) => Promise<{ receipts: FeishuAssetReceipt[] }>
  queryArtifact: (query: { artifactKey?: string; generationId?: string; projectId?: string }) => Promise<FeishuAssetReceipt[]>
  updateArtifact: (input: { artifactKey: string; docToken?: string; newContent: string; stage: string }) => Promise<{ token: string; url: string; version: number }>
  listProjectAssets: (projectId: string, kind?: string) => Promise<FeishuAssetReceipt[]>
  verifyArtifact: (input: { token: string; kind: string }) => Promise<{ ok: boolean; detail: string }>
}): Record<string, McpToolHandler> {
  return {
    create_artifact: async (args) => {
      const error = validateCreateArtifactInput(args)
      if (error) {
        return { content: [{ type: "text", text: `输入校验失败：${error}` }], isError: true }
      }

      const spec: AimArtifactSpec = {
        artifactKey: buildArtifactKey(
          args.kind as FeishuAssetKind,
          args.workItemRecordId as string,
        ),
        generationId: `mcp_${Date.now()}`,
        workItemRecordId: args.workItemRecordId as string,
        projectId: args.projectId as string,
        kind: args.kind as FeishuAssetKind,
        role: (args.role as ArtifactRole) ?? "primary",
        title: args.title as string,
        required: true,
        permissionProfile: (args.permissionProfile as PermissionProfile) ?? "internal",
        payload: { markdown: args.content },
      }

      const result = await services.createArtifact(spec)
      return {
        content: [{ type: "text", text: JSON.stringify(result.receipts, null, 2) }],
      }
    },

    query_artifact: async (args) => {
      const receipts = await services.queryArtifact({
        artifactKey: args.artifactKey as string | undefined,
        generationId: args.generationId as string | undefined,
        projectId: args.projectId as string | undefined,
      })
      return {
        content: [{ type: "text", text: JSON.stringify(receipts, null, 2) }],
      }
    },

    update_artifact: async (args) => {
      const error = validateUpdateArtifactInput(args)
      if (error) {
        return { content: [{ type: "text", text: `输入校验失败：${error}` }], isError: true }
      }

      const result = await services.updateArtifact({
        artifactKey: args.artifactKey as string,
        docToken: args.docToken as string | undefined,
        newContent: args.newContent as string,
        stage: args.stage as string,
      })
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      }
    },

    list_project_assets: async (args) => {
      if (!args.projectId) {
        return { content: [{ type: "text", text: "缺少 projectId" }], isError: true }
      }
      const receipts = await services.listProjectAssets(
        args.projectId as string,
        args.kind as string | undefined,
      )
      return {
        content: [{ type: "text", text: JSON.stringify(receipts, null, 2) }],
      }
    },

    verify_artifact: async (args) => {
      if (!args.token || !args.kind) {
        return { content: [{ type: "text", text: "缺少 token 或 kind" }], isError: true }
      }
      const result = await services.verifyArtifact({
        token: args.token as string,
        kind: args.kind as string,
      })
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      }
    },
  }
}
