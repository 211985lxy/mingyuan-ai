import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { permanentlyDeleteOwnedProject } from "@/features/projects/services/project-lifecycle"

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return undefined
  const text = value.trim()
  return text ? text.slice(0, maxLength) : null
}

function cleanRequiredText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return undefined
  const text = value.trim()
  return text ? text.slice(0, maxLength) : undefined
}

const VALID_STATUS = new Set(["active", "paused", "archived"])

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await parseJsonRecord(request)

    const existing = await prisma.clientProject.findFirst({
      where: { id, userId: user.id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "客户项目不存在" }, { status: 404 })
    }

    const nextStatus = typeof body.status === "string" && VALID_STATUS.has(body.status)
      ? body.status
      : undefined

    const project = await prisma.clientProject.update({
      where: { id, userId: user.id },
      data: {
        name: cleanRequiredText(body.name, 80),
        companyName: cleanText(body.companyName, 80),
        industry: cleanText(body.industry, 80),
        targetCustomer: cleanText(body.targetCustomer, 1000),
        offer: cleanText(body.offer, 1000),
        deliveryGoal: cleanText(body.deliveryGoal, 1000),
        notes: cleanText(body.notes, 2000),
        status: nextStatus,
      },
    })

    return NextResponse.json(project)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目更新失败" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    const existing = await prisma.clientProject.findFirst({
      where: { id, userId: user.id },
      select: { id: true, name: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "客户项目不存在" }, { status: 404 })
    }

    const url = new URL(request.url)
    if (url.searchParams.get("permanent") === "true") {
      if (url.searchParams.get("confirm") !== existing.name) {
        return NextResponse.json({ error: "永久删除必须使用项目名称确认" }, { status: 400 })
      }
      const deleted = await permanentlyDeleteOwnedProject(user.id, id)
      return NextResponse.json({ deleted: Boolean(deleted), details: deleted })
    }

    const project = await prisma.clientProject.update({
      where: { id, userId: user.id },
      data: { status: "archived" },
    })

    return NextResponse.json(project)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目归档失败" },
      { status: 500 }
    )
  }
}
