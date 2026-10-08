/**
 * 公开 MCP 工具注册口。
 * 和页面上的作品编辑共用同一套工具描述，不依赖尚未接上的 mcp-handler 空壳。
 */

import type { z } from "zod"

export interface AimMcpToolExtra {
  authInfo?: unknown
}

export interface AimMcpToolResult {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export interface AimMcpToolConfig<Args extends z.ZodRawShape | undefined = undefined> {
  title?: string
  description?: string
  annotations?: { readOnlyHint?: boolean }
  inputSchema?: Args
}

export interface AimMcpToolServer {
  registerTool(
    name: string,
    config: AimMcpToolConfig,
    handler: (extra: AimMcpToolExtra) => Promise<AimMcpToolResult>,
  ): void
  registerTool<Args extends z.ZodRawShape>(
    name: string,
    config: AimMcpToolConfig<Args> & { inputSchema: Args },
    handler: (args: z.infer<z.ZodObject<Args>>, extra: AimMcpToolExtra) => Promise<AimMcpToolResult>,
  ): void
}
