import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { AccountProjectContextError, resolveBoundProject } from "@/lib/account-project-context"

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

/**
 * @description 处理 PATCH 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const body = await parseJsonRecord(request)
    await resolveBoundProject({ userId: user.id, requestedProjectId: id })

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
    if (nextStatus && nextStatus !== "active") {
      return NextResponse.json({ error: "账号绑定项目不能暂停或归档", code: "ACCOUNT_PROJECT_STATUS_LOCKED" }, { status: 409 })
    }

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
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目更新失败" },
      { status: 500 }
    )
  }
}

/**
 * @description 处理 DELETE 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    await resolveBoundProject({ userId: user.id, requestedProjectId: id })

    const existing = await prisma.clientProject.findFirst({
      where: { id, userId: user.id },
      select: { id: true, name: true },
    })
    if (!existing) {
      return NextResponse.json({ error: "客户项目不存在" }, { status: 404 })
    }

    return NextResponse.json(
      { error: "账号绑定项目不能归档或删除", code: "ACCOUNT_PROJECT_STATUS_LOCKED" },
      { status: 409 },
    )
  } catch (error) {
    if (error instanceof AccountProjectContextError || isAccountProjectContextError(error)) {
      const contextError = error as { message: string; code: string; status: number }
      return NextResponse.json({ error: contextError.message, code: contextError.code }, { status: contextError.status })
    }
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目归档失败" },
      { status: 500 }
    )
  }
}

function isAccountProjectContextError(error: unknown): error is { message: string; code: string; status: number } {
  return typeof error === "object" && error !== null
    && typeof (error as { code?: unknown }).code === "string"
    && typeof (error as { status?: unknown }).status === "number"
}
