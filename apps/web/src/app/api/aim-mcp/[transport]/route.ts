/**
 * MCP entry point for the AIM remote capability surface.
 *
 * Final connect address: https://mingyuan-ai.cn/api/aim-mcp/mcp
 * Transport: Streamable HTTP（无状态 JSON-RPC，不用 SSE）。
 * Auth: maim_ Bearer Key via verifyMcpToken → authenticateAgentToken.
 *
 * 默认关闭。管理员设置 AIM_MCP_ENABLED=true 后才会应答。
 * 域名白名单用 AIM_MCP_ALLOWED_HOSTS，不设时只允许 mingyuan-ai.cn。
 */

import { NextResponse } from "next/server"
import { isAllowedMcpHost, isMcpEnabled } from "@/lib/aim-remote/feature-flags"
import { createAimMcpHttpHandler } from "@/lib/aim-remote/mcp-http"
import { verifyMcpToken } from "@/lib/aim-remote/mcp-auth"
import { registerAimMcpTools } from "@/lib/aim-remote/mcp-tools"

export const runtime = "nodejs"
export const maxDuration = 60

const MCP_INSTRUCTIONS = [
  "只生成草稿。作品编辑（发作品阶段）用 aim_work_editor_start：润色、违禁词审查、公众号排版、小红书图文、发布前质检。",
  "没有成稿或没有绑定项目会失败，空结果不算成功。",
  "不允许自动发布、写入飞书、修改知识库、修改 IP 营销全案。",
].join("")

const authenticatedHandler = createAimMcpHttpHandler({
  register: (server) => {
    registerAimMcpTools(server)
  },
  verifyToken: verifyMcpToken,
  serverInfo: { name: "mingyuan-aim", version: "0.1.0" },
  instructions: MCP_INSTRUCTIONS,
})

/**
 * @description 处理 GET 请求 — MCP Streamable HTTP 入口
 */
export async function GET(request: Request) {
  return handle(request)
}

/**
 * @description 处理 POST 请求 — MCP Streamable HTTP 入口
 */
export async function POST(request: Request) {
  return handle(request)
}

async function handle(request: Request) {
  if (!isMcpEnabled()) {
    return NextResponse.json({
      error: "MCP surface is disabled",
      hint: "管理员在服务器设置 AIM_MCP_ENABLED=true 后重启。打开后仍必须带 Authorization: Bearer maim_ Key。域名白名单用 AIM_MCP_ALLOWED_HOSTS，默认 mingyuan-ai.cn。",
    }, { status: 503 })
  }
  if (!isHostAllowed(request)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 })
  }
  return authenticatedHandler(request)
}

function isHostAllowed(request: Request): boolean {
  return [request.headers.get("x-forwarded-host"), request.headers.get("host")].some((host) => isAllowedMcpHost(host))
}
