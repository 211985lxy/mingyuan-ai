import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"

export const POST = withUserAuth(async (request, { user, params }) => {
  const topicSelectionId = params?.id

  if (!topicSelectionId) {
    return NextResponse.json(
      { error: "Topic selection ID is required" },
      { status: 400 },
    )
  }

  const body = await request.json()
  const selectedIndex =
    typeof body.selectedIndex === "number" ? body.selectedIndex : null

  if (selectedIndex === null || selectedIndex < 0 || selectedIndex > 3) {
    return NextResponse.json(
      { error: "selectedIndex must be 0, 1, 2, or 3" },
      { status: 400 },
    )
  }

  // Atomic status transition: only update if still "pending"
  // This prevents concurrent requests from both succeeding
  try {
    const updated = await prisma.topicSelection.update({
      where: {
        id: topicSelectionId,
        userId: user.id,
        status: "pending",
      },
      data: {
        selectedIndex,
        status: "selected",
      },
    })

    const candidates = updated.candidates as unknown as Array<
      Record<string, unknown>
    >
    if (!Array.isArray(candidates) || selectedIndex >= candidates.length) {
      // Rollback: shouldn't happen since we control generation, but guard anyway
      await prisma.topicSelection.update({
        where: { id: topicSelectionId, userId: user.id },
        data: { selectedIndex: null, status: "pending" },
      })
      return NextResponse.json(
        { error: "Selected index out of bounds" },
        { status: 400 },
      )
    }

    const selectedCard = candidates[selectedIndex]

    console.log(
      `[topic-select] User ${user.id} selected card ${selectedIndex} from ${topicSelectionId}`,
    )

    return NextResponse.json({
      data: {
        topicSelectionId: updated.id,
        selectedIndex: updated.selectedIndex,
        selectedCard,
        status: updated.status,
      },
    })
  } catch (error) {
    // Prisma P2025: Record not found (already selected or wrong user)
    const prismaError = error as { code?: string }
    if (prismaError.code === "P2025") {
      return NextResponse.json(
        { error: "Topic selection not found or already confirmed" },
        { status: 409 },
      )
    }
    throw error
  }
})
