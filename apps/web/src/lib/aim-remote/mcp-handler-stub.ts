/**
 * mcp-handler stub — 真实包待安装，当前提供占位导出使构建通过。
 * 当 AIM_MCP_ENABLED=false（默认）时不会实际调用。
 */

type McpServer = { tool: (...args: unknown[]) => void }
type McpHandler = (request: Request) => Promise<Response>

export function createMcpHandler(
  _register: (server: McpServer) => void,
  _info?: unknown,
  _opts?: unknown,
): McpHandler {
  return async () =>
    new Response(JSON.stringify({ error: "MCP handler not installed" }), {
      status: 501,
      headers: { "content-type": "application/json" },
    })
}

export function withMcpAuth(
  handler: McpHandler,
  _verify: unknown,
  _opts?: unknown,
): McpHandler {
  return handler
}
