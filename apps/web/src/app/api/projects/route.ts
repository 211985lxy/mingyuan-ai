import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { enforceCountBetaLimit } from "@/lib/internal-beta-limits"

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const status = url.searchParams.get("status") || "active"

    const projects = await prisma.clientProject.findMany({
      where: {
        userId: user.id,
        ...(status === "all" ? {} : { status }),
      },
      orderBy: { updatedAt: "desc" },
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
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目读取失败" },
      { status: 500 }
    )
  }
}

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

    const project = await prisma.clientProject.create({
      data: {
        userId: user.id,
        name,
        companyName: cleanText(body.companyName, 80),
        industry: cleanText(body.industry, 80),
        targetCustomer: cleanText(body.targetCustomer, 1000),
        offer: cleanText(body.offer, 1000),
        deliveryGoal: cleanText(body.deliveryGoal, 1000),
        notes: cleanText(body.notes, 2000),
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "客户项目创建失败" },
      { status: 500 }
    )
  }
}
