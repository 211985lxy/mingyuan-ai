import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import {
  buildAimHistoryUpdateData,
  parseAimHistoryUpdate,
} from "@/lib/aim/services/history-update"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await request.json()

    const existing = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        retroSnapshots: true,
        calibrationRules: true,
        decisionSnapshot: true,
      },
    })
    if (!existing) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }

    const input = parseAimHistoryUpdate(body)
    if (!input.ok) {
      return NextResponse.json({ error: input.error }, { status: 400 })
    }

    const record = await prisma.aimGeneration.update({
      where: { id },
      data: buildAimHistoryUpdateData(input.data, existing),
    })

    return NextResponse.json(record)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "生成记录更新失败" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(_request)
    const { id } = await params

    const existing = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }

    await prisma.aimGeneration.delete({ where: { id } })
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "生成记录删除失败" },
      { status: 500 }
    )
  }
}
