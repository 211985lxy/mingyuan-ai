import { NextRequest, NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { incrementSecurityMetric } from "@/lib/security-metrics"
import {
  isObsidianExportEnabledForUser,
  loadObsidianSyncConfig,
  resolveFixedExportRoot,
} from "@/lib/obsidian-export"

/**
 * @description Obsidian 导出能力状态；默认关闭，不回传服务器绝对路径
 */
export const GET = withUserAuth(async (_request: NextRequest, { user }) => {
  if (!isObsidianExportEnabledForUser(user.id)) {
    incrementSecurityMetric("obsidian.denied", { reason: "status_disabled_or_wrong_user" })
    return NextResponse.json({
      enabled: false,
      isPhysicalMode: false,
    })
  }

  try {
    const config = await loadObsidianSyncConfig()
    if (!config) {
      return NextResponse.json({
        enabled: true,
        isPhysicalMode: false,
      })
    }

    const root = await resolveFixedExportRoot(config)
    return NextResponse.json({
      enabled: true,
      isPhysicalMode: root.ok,
    })
  } catch {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
})
