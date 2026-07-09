import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { parseDocument, isSupportedFile } from "@/lib/document-parser"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { buildDefaultKnowledgeTags } from "@/lib/knowledge-tags"
import {
  enforceKnowledgeBetaLimit,
  enforceUploadSizeLimit,
} from "@/lib/internal-beta-limits"

export const POST = withUserAuth(async (request, { user }) => {
  const formData = await request.formData()
  const file = formData.get("file") as File | null
  const category = (formData.get("category") as string) || "product_usp"
  const projectIdValue = formData.get("projectId")
  const projectId =
    typeof projectIdValue === "string" && projectIdValue.trim()
      ? projectIdValue.trim()
      : null

  if (!projectId) {
    return NextResponse.json({ error: "请选择归属全案" }, { status: 400 })
  }

  if (!file) {
    return NextResponse.json({ error: "请上传文件" }, { status: 400 })
  }

  if (!isSupportedFile(file.name)) {
    return NextResponse.json(
      { error: "暂不支持该文件格式" },
      { status: 400 },
    )
  }

  const uploadLimitResponse = enforceUploadSizeLimit([file])
  if (uploadLimitResponse) return uploadLimitResponse

  const project = await prisma.clientProject.findFirst({
    where: {
      id: projectId,
      userId: user.id,
      status: "active",
    },
    select: { id: true },
  })

  if (!project) {
    return NextResponse.json(
      { error: "IP营销全案不存在或已归档" },
      { status: 404 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const chunks = await parseDocument(buffer, file.name)

  const knowledgeLimitResponse = await enforceKnowledgeBetaLimit({
    userId: user.id,
    projectId: project.id,
    incoming: chunks.length,
  })
  if (knowledgeLimitResponse) return knowledgeLimitResponse

  const entries: Array<{ id: string }> = []
  for (const content of chunks) {
    const title =
      file.name.replace(/\.[^.]+$/, "") +
      (chunks.length > 1 ? ` (${entries.length + 1}/${chunks.length})` : "")
    const entry = await prisma.knowledgeEntry.create({
      data: {
        userId: user.id,
        projectId: project.id,
        category,
        title,
        content: content.slice(0, 50000),
        sourceType: "import",
        tags: buildDefaultKnowledgeTags(category),
        status: "active",
      },
      select: { id: true },
    })
    entries.push(entry)
  }

  for (const entry of entries) {
    ensureKnowledgeEmbedding(entry.id).catch(() => {})
  }

  return NextResponse.json(
    { data: { created: entries.length, entries } },
    { status: 201 },
  )
})
