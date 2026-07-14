import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"

const VALID_STATUSES = new Set(["draft", "candidate", "selected", "discarded"])

export const PATCH = withUserAuth(async (request, { user, params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 })
  }

  const body = await request.json()
  const content =
    typeof body.content === "string" ? body.content.trim() : undefined
  const status = typeof body.status === "string" ? body.status : undefined

  if (status && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })
  }

  const script = await prisma.script.findFirst({ where: { id, userId: user.id } })
  if (!script) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (status === "selected" && script.generationRunId) {
      await tx.script.updateMany({
        where: {
          userId: user.id,
          generationRunId: script.generationRunId,
          status: "selected",
          NOT: { id: script.id },
        },
        data: {
          status: "candidate",
          selectedAt: null,
        },
      })
    }

    return tx.script.update({
      where: { id: script.id, userId: user.id },
      data: {
        content: content ?? script.content,
        status: status ?? script.status,
        selectedAt:
          status === "selected"
            ? new Date()
            : status
              ? null
              : script.selectedAt,
      },
    })
  })

  return NextResponse.json({ data: updated })
})
