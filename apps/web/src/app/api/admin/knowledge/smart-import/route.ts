import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { parseDocument } from "@/lib/document-parser"
import { processChunksForSmartImport } from "@/lib/knowledge-auto-processor"
import { enforceUploadSizeLimit } from "@/lib/internal-beta-limits"

export const maxDuration = 120

/**
 * POST /api/admin/knowledge/smart-import
 * 接收文件 → 解析 → LLM 分类/标签/去重 → 返回预览结果（不写库）
 */
export const POST = withAdminOrEditor(async (request, { admin }) => {
  const formData = await request.formData()
  const files = formData.getAll("files") as File[]
  const projectIdValue = formData.get("projectId")
  const projectId = typeof projectIdValue === "string" && projectIdValue.trim()
    ? projectIdValue.trim()
    : null

  if (files.length === 0) {
    return NextResponse.json({ error: "请上传至少一个文件" }, { status: 400 })
  }

  const uploadLimitResponse = enforceUploadSizeLimit(files)
  if (uploadLimitResponse) return uploadLimitResponse

  // 解析归属用户：有项目取项目 userId，否则按 admin email 匹配前台用户
  const project = projectId
    ? await prisma.clientProject.findUnique({
        where: { id: projectId },
        select: { id: true, userId: true },
      })
    : null

  if (projectId && !project) {
    return NextResponse.json({ error: "归属项目不存在" }, { status: 404 })
  }

  const user = project
    ? { id: project.userId }
    : await prisma.user.findUnique({
        where: { email: admin.email },
        select: { id: true },
      })

  if (!user) {
    return NextResponse.json({ error: "未找到同邮箱前台用户，请指定项目或确认邮箱" }, { status: 400 })
  }

  // 解析所有文件 → 收集文本块
  const allChunks: string[] = []
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer())
    const chunks = await parseDocument(buffer, file.name)
    allChunks.push(...chunks)
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

  // LLM 智能分类
  const processed = await processChunksForSmartImport({
    chunks: allChunks,
    fileName: files.map((f) => f.name).join(", "),
    userId: user.id,
    projectId: project?.id ?? undefined,
  })

  return NextResponse.json({
    data: {
      userId: user.id,
      projectId: project?.id ?? null,
      processed,
      fileNames: files.map((f) => f.name),
    },
  })
})
