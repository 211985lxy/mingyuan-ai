// @ts-nocheck — mcp-handler 依赖待安装，临时跳过类型检查
/**
 * MCP entry point for the AIM remote capability surface.
 *
 * Final connect address: https://mingyuan-ai.cn/api/aim-mcp/mcp
 * Transport: Streamable HTTP (SSE disabled per current MCP spec).
 * Auth: existing maim_ Bearer Key via withMcpAuth → authenticateAgentToken.
 *
 * Gated by AIM_MCP_ENABLED (defaults off). Host whitelist (AIM_MCP_ALLOWED_HOSTS)
 * is enforced to prevent the MCP surface being reached from arbitrary hosts.
 */

import { NextResponse } from "next/server"
import { createMcpHandler, withMcpAuth } from "@/lib/aim-remote/mcp-handler-stub"
import { isMcpEnabled, getAllowedMcpHosts } from "@/lib/aim-remote/feature-flags"
import { verifyMcpToken } from "@/lib/aim-remote/mcp-auth"
import { registerAimMcpTools } from "@/lib/aim-remote/mcp-tools"
import { registerAssetMcpTools } from "@/lib/aim/artifacts/mcp-asset-ports"

export const runtime = "nodejs"
export const maxDuration = 60

/** Validate the request Host / X-Forwarded-Host against the allowlist. */
function isHostAllowed(request: Request): boolean {
  const allowed = getAllowedMcpHosts()
  if (allowed.length === 0) return true
  const candidates = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ].filter((h): h is string => Boolean(h))
  return candidates.some((host) => allowed.includes(host) || allowed.some((a) => host.endsWith(a)))
}

// Build the MCP route handler once at module load. createMcpHandler returns a
// (request) => Promise<Response>; we wrap it with withMcpAuth so every tool
// invocation is authenticated against a valid maim_ key.
const mcpRouteHandler = createMcpHandler(
  (server) => {
    registerAimMcpTools(server)
    registerAssetMcpTools(server)
  },
  { serverInfo: { name: "mingyuan-aim", version: "0.1.0" } },
  {
    // SSE disabled per 2025-03-26 MCP spec; streamable HTTP only.
    disableSse: true,
    maxDuration: 60,
    verboseLogs: false,
  },
)

const authenticatedHandler = withMcpAuth(mcpRouteHandler, verifyMcpToken, { required: true })

/**
 * @description 处理 GET 请求 — MCP Streamable HTTP 入口
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: Request) {
  return handle(request)
}

/**
 * @description 处理 POST 请求 — MCP Streamable HTTP 入口
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: Request) {
  return handle(request)
}

async function handle(request: Request) {
  if (!isMcpEnabled()) {
    return NextResponse.json({ error: "MCP surface is disabled" }, { status: 503 })
  }
  if (!isHostAllowed(request)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 })
  }
  return authenticatedHandler(request)
}
