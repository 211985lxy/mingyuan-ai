import { NextRequest, NextResponse } from "next/server"

import { getConnectorHealth } from "@/lib/aim/connectors/connector-health"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request)
    return NextResponse.json({ connectors: [
      getConnectorHealth("feishu", process.env),
      getConnectorHealth("wecom", process.env),
    ] })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "连接器状态读取失败" }, { status: 500 })
  }
}
