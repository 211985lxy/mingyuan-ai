import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { parseDocument, DocumentParseError } from "@/lib/document-parser"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { buildDefaultKnowledgeTags } from "@/lib/knowledge-tags"
import { enforceKnowledgeBetaLimit } from "@/lib/internal-beta-limits"
import {
  cleanupTempDir,
  KnowledgeMultipartError,
  receiveKnowledgeMultipart,
} from "@/lib/knowledge-multipart"
import { readFile } from "node:fs/promises"

export const POST = withAdminOrEditor(async (request, { admin }) => {
  let tempDir: string | null = null
  try {
    const received = await receiveKnowledgeMultipart(request)
    tempDir = received.tempDir

    const category = received.fields.category || "product_usp"
    const projectId = received.fields.projectId?.trim() || null
    const fileEntry = received.files[0]

    if (!fileEntry) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 })
    }

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
      return NextResponse.json(
        { error: "未找到同邮箱前台用户，无法绑定知识条目" },
        { status: 400 },
      )
    }

    const buffer = await readFile(fileEntry.tempPath)
    const chunks = await parseDocument(buffer, fileEntry.originalName)

    const knowledgeLimitResponse = await enforceKnowledgeBetaLimit({
      userId: user.id,
      projectId: project?.id ?? null,
      incoming: chunks.length,
    })
    if (knowledgeLimitResponse) return knowledgeLimitResponse

    const entries: unknown[] = []
    for (const content of chunks) {
      const title: string =
        fileEntry.originalName.replace(/\.[^.]+$/, "") +
        (chunks.length > 1 ? ` (${entries.length + 1}/${chunks.length})` : "")
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

    for (const entry of entries) {
      const e = entry as { id: string }
      ensureKnowledgeEmbedding(e.id).catch(() => {})
    }

    return NextResponse.json({ data: { created: entries.length, entries } }, { status: 201 })
  } catch (error) {
    if (error instanceof KnowledgeMultipartError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }
    if (error instanceof DocumentParseError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      )
    }
    throw error
  } finally {
    await cleanupTempDir(tempDir)
  }
})
