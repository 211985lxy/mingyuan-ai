import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { incrementSecurityMetric } from "@/lib/security-metrics"
import {
  consumeDailyExportQuota,
  isObsidianExportEnabledForUser,
  loadObsidianSyncConfig,
  measureExportDirUsage,
  OBSIDIAN_LIMITS,
  resolveFixedExportRoot,
  writeObsidianExportFile,
} from "@/lib/obsidian-export"

export const POST = withUserAuth(async (request: NextRequest, { user }) => {
  if (!isObsidianExportEnabledForUser(user.id)) {
    incrementSecurityMetric("obsidian.denied", { reason: "disabled_or_wrong_user" })
    return NextResponse.json({ error: "Obsidian export is disabled" }, { status: 403 })
  }

  try {
    const body = await parseJsonRecord(request, { maxBytes: OBSIDIAN_LIMITS.BODY_MAX_BYTES })
    const title = typeof body.title === "string" ? body.title : ""
    const content = typeof body.content === "string" ? body.content : ""
    const format = typeof body.format === "string" ? body.format : "script"

    if (!title.trim() || !content) {
      return NextResponse.json({ error: "标题和内容不能为空" }, { status: 400 })
    }

    if (title.length > OBSIDIAN_LIMITS.TITLE_MAX_CHARS) {
      incrementSecurityMetric("obsidian.quota", { reason: "title_too_long" })
      return NextResponse.json({ error: "标题过长" }, { status: 413 })
    }

    if (Buffer.byteLength(content, "utf8") > OBSIDIAN_LIMITS.CONTENT_MAX_BYTES) {
      incrementSecurityMetric("obsidian.quota", { reason: "content_too_large" })
      return NextResponse.json({ error: "正文过大" }, { status: 413 })
    }

    if (!consumeDailyExportQuota(user.id)) {
      incrementSecurityMetric("obsidian.quota", { reason: "daily_limit" })
      return NextResponse.json({ error: "今日导出次数已达上限" }, { status: 429 })
    }

    const config = await loadObsidianSyncConfig()
    if (!config) {
      return NextResponse.json({ error: "Obsidian 未配置" }, { status: 404 })
    }

    const root = await resolveFixedExportRoot(config)
    if (!root.ok) {
      incrementSecurityMetric("obsidian.denied", { reason: root.code })
      return NextResponse.json({ error: "导出目录不可用" }, { status: 400 })
    }

    const usage = await measureExportDirUsage(root.exportRoot)
    if (
      usage.bytes >= OBSIDIAN_LIMITS.VAULT_MAX_BYTES
      || usage.files >= OBSIDIAN_LIMITS.VAULT_MAX_FILES
    ) {
      incrementSecurityMetric("obsidian.quota", { reason: "vault_capacity" })
      return NextResponse.json({ error: "导出目录已达容量上限" }, { status: 429 })
    }

    const written = await writeObsidianExportFile({
      exportRoot: root.exportRoot,
      exportDirName: root.exportDirName,
      title: title.trim(),
      content,
      format,
    })

    if (!written.ok) {
      incrementSecurityMetric("obsidian.denied", { reason: written.code })
      return NextResponse.json({ error: "写入失败" }, { status: 500 })
    }

    incrementSecurityMetric("obsidian.ok")
    return NextResponse.json({
      success: true,
      fileName: written.fileName,
      relativeFilePath: written.relativeFilePath,
    })
  } catch (error) {
    const contract = apiRequestErrorResponse(request, error)
    if (contract) return contract
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
})
