import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { enforceCountBetaLimit } from "@/lib/internal-beta-limits"
import {
  AccountProjectContextError,
  createInitialAccountProject,
  getAccountProjectContext,
} from "@/lib/account-project-context"

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const status = url.searchParams.get("status") || "active"
    const context = await getAccountProjectContext(user.id)

    if (context.status !== "bound") return NextResponse.json([])

    const projects = await prisma.clientProject.findMany({
      where: {
        userId: user.id,
        id: context.project.id,
        ...(status === "all" ? {} : { status }),
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        _count: {
          select: { aimGenerations: true },
        },
        aimGenerations: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            rawInput: true,
            workflowStatus: true,
            createdAt: true,
          },
        },
      },
    })

    return NextResponse.json(projects)
  } catch (error) {
    return contextErrorResponse(error) ?? authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目读取失败" },
      { status: 500 }
    )
  }
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const name = cleanText(body.name, 80)

    if (!name) {
      return NextResponse.json({ error: "项目名称必填" }, { status: 400 })
    }

    const limitResponse = await enforceCountBetaLimit({ userId: user.id, kind: "client_project" })
    if (limitResponse) return limitResponse

    const project = await createInitialAccountProject(user.id, {
      name,
      companyName: cleanText(body.companyName, 80),
      industry: cleanText(body.industry, 80),
      targetCustomer: cleanText(body.targetCustomer, 1000),
      offer: cleanText(body.offer, 1000),
      deliveryGoal: cleanText(body.deliveryGoal, 1000),
      notes: cleanText(body.notes, 2000),
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    return contextErrorResponse(error) ?? authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目创建失败" },
      { status: 500 }
    )
  }
}

function contextErrorResponse(error: unknown) {
  if (!(error instanceof AccountProjectContextError)) return null
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  )
}
