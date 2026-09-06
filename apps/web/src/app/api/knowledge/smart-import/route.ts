import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { parseDocument, isSupportedFile } from "@/lib/document-parser"
import { processChunksForSmartImport } from "@/lib/knowledge-auto-processor"
import { enforceUploadSizeLimit } from "@/lib/internal-beta-limits"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const maxDuration = 120

/**
 * POST /api/knowledge/smart-import
 * 客户侧：接收文件 → 解析 → LLM 分类/标签/去重 → 返回预览（不写库）
 */
export const POST = withUserAuth(async (request, { user }) => {
  const formData = await request.formData()
  const files = (formData.getAll("files") as File[]).filter(
    (file): file is File => file instanceof File && file.size >= 0 && Boolean(file.name),
  )
  const projectIdValue = formData.get("projectId")
  const requestedProjectId =
    typeof projectIdValue === "string" && projectIdValue.trim()
      ? projectIdValue.trim()
      : undefined

  if (files.length === 0) {
    return NextResponse.json({ error: "请上传至少一个文件" }, { status: 400 })
  }

  const unsupported = files.filter((file) => !isSupportedFile(file.name))
  if (unsupported.length > 0) {
    return NextResponse.json(
      { error: `暂不支持：${unsupported.map((file) => file.name).join("、")}` },
      { status: 400 },
    )
  }

  const uploadLimitResponse = enforceUploadSizeLimit(files)
  if (uploadLimitResponse) return uploadLimitResponse

  let project: Awaited<ReturnType<typeof resolveBoundProject>>
  try {
    project = await resolveBoundProject({ userId: user.id, requestedProjectId })
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    throw error
  }

  const allChunks: string[] = []
  try {
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const chunks = await parseDocument(buffer, file.name)
      allChunks.push(...chunks)
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "文件解析失败" },
      { status: 400 },
    )
  }

  if (allChunks.length === 0) {
    return NextResponse.json({ error: "所有文件内容为空" }, { status: 400 })
  }

  if (allChunks.length > 60) {
    return NextResponse.json(
      { error: `内容块过多（${allChunks.length}），请减少文件数量或拆分上传` },
      { status: 400 },
    )
  }

  const processed = await processChunksForSmartImport({
    chunks: allChunks,
    fileName: files.map((file) => file.name).join(", "),
    userId: user.id,
    projectId: project.id,
  })

  return NextResponse.json({
    data: {
      userId: user.id,
      projectId: project.id,
      processed,
      fileNames: files.map((file) => file.name),
    },
  })
})

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
