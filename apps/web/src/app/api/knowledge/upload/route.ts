import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { parseDocument, isSupportedFile, DocumentParseError } from "@/lib/document-parser"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { buildDefaultKnowledgeTags } from "@/lib/knowledge-tags"
import {
  enforceKnowledgeBetaLimit,
} from "@/lib/internal-beta-limits"
import {
  cleanupTempDir,
  KnowledgeMultipartError,
  receiveKnowledgeMultipart,
} from "@/lib/knowledge-multipart"
import { readFile } from "node:fs/promises"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

export const POST = withUserAuth(async (request, { user }) => {
  let tempDir: string | null = null
  try {
    const received = await receiveKnowledgeMultipart(request)
    tempDir = received.tempDir

    const category = received.fields.category || "product_usp"
    const requestedProjectId = received.fields.projectId?.trim() || undefined
    const fileEntry = received.files[0]

    if (!fileEntry) {
      return NextResponse.json({ error: "请上传文件" }, { status: 400 })
    }

    if (!isSupportedFile(fileEntry.originalName)) {
      return NextResponse.json(
        { error: "暂不支持该文件格式" },
        { status: 400 },
      )
    }

    const project = await resolveBoundProject({ userId: user.id, requestedProjectId })

    const buffer = await readFile(fileEntry.tempPath)
    const chunks = await parseDocument(buffer, fileEntry.originalName)

    const knowledgeLimitResponse = await enforceKnowledgeBetaLimit({
      userId: user.id,
      projectId: project.id,
      incoming: chunks.length,
    })
    if (knowledgeLimitResponse) return knowledgeLimitResponse

    const entries: Array<{ id: string }> = []
    for (const content of chunks) {
      const title =
        fileEntry.originalName.replace(/\.[^.]+$/, "") +
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
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json(
        { error: contextError.message, code: contextError.code },
        { status: contextError.status },
      )
    }
    throw error
  } finally {
    await cleanupTempDir(tempDir)
  }
})

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
