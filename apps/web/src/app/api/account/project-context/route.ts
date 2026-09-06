import { parseJsonRecord } from "@/lib/api-contract"
import {
  AccountProjectContextError,
  createInitialAccountProject,
  getAccountProjectContext,
} from "@/lib/account-project-context"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { NextRequest, NextResponse } from "next/server"

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null
  const text = value.trim()
  return text ? text.slice(0, maxLength) : null
}

function contextErrorResponse(error: unknown) {
  if (!(error instanceof AccountProjectContextError)) return null
  return NextResponse.json(
    { error: error.message, code: error.code },
    { status: error.status },
  )
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    return NextResponse.json(await getAccountProjectContext(user.id))
  } catch (error) {
    return contextErrorResponse(error)
      ?? authErrorResponse(error)
      ?? NextResponse.json({ error: "账号项目上下文读取失败" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const name = cleanText(body.name, 80)
    if (!name) return NextResponse.json({ error: "项目名称必填" }, { status: 400 })

    const project = await createInitialAccountProject(user.id, {
      name,
      companyName: cleanText(body.companyName, 80),
      industry: cleanText(body.industry, 80),
      targetCustomer: cleanText(body.targetCustomer, 1000),
      offer: cleanText(body.offer, 1000),
      deliveryGoal: cleanText(body.deliveryGoal, 1000),
      notes: cleanText(body.notes, 2000),
    })

    return NextResponse.json({ status: "bound", project }, { status: 201 })
  } catch (error) {
    return contextErrorResponse(error)
      ?? authErrorResponse(error)
      ?? NextResponse.json({ error: "账号项目绑定失败" }, { status: 500 })
  }
}
