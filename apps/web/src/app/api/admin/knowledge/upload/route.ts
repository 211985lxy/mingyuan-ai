import { NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { parseDocument } from "@/lib/document-parser"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { buildDefaultKnowledgeTags } from "@/lib/knowledge-tags"
import { enforceKnowledgeBetaLimit, enforceUploadSizeLimit } from "@/lib/internal-beta-limits"

export const POST = withAdminAuth(async (request, { admin }) => {
  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const category = (formData.get("category") as string) || "product_usp"
  const projectIdValue = formData.get("projectId")
  const projectId = typeof projectIdValue === "string" && projectIdValue.trim()
    ? projectIdValue.trim()
    : null

  if (!file) {
    return NextResponse.json({ error: "请上传文件" }, { status: 400 })
  }

  const uploadLimitResponse = enforceUploadSizeLimit([file])
  if (uploadLimitResponse) return uploadLimitResponse

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
    return NextResponse.json({ error: "未找到同邮箱前台用户，无法绑定知识条目" }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const chunks = await parseDocument(buffer, file.name)

  const knowledgeLimitResponse = await enforceKnowledgeBetaLimit({
    userId: user.id,
    projectId: project?.id ?? null,
    incoming: chunks.length,
  })
  if (knowledgeLimitResponse) return knowledgeLimitResponse

  const entries: unknown[] = []
  for (const content of chunks) {
    const title: string = file.name.replace(/\.[^.]+$/, "") + (chunks.length > 1 ? ` (${entries.length + 1}/${chunks.length})` : "")
    const entry = await prisma.knowledgeEntry.create({
      data: {
        userId: user.id,
        projectId: project?.id ?? null,
        category,
        title,
        content: content.slice(0, 50000),
        sourceType: "import",
        tags: buildDefaultKnowledgeTags(category),
        status: "active",
      },
    })
    entries.push(entry)
  }

  // Fire-and-forget: generate embeddings for uploaded entries
  for (const entry of entries) {
    const e = entry as { id: string }
    ensureKnowledgeEmbedding(e.id).catch(() => {})
  }

  return NextResponse.json({ data: { created: entries.length, entries } }, { status: 201 })
})
