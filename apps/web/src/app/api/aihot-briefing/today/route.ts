import { NextRequest, NextResponse } from "next/server"
import { getTodayAiHotBriefing } from "@/lib/aihot-briefing"
import {
  fetchIndustryBriefingItems,
  sourcesForEmail,
} from "@/lib/account-industry-sources"
import { loadEffectiveAccountSourceBindings } from "@/lib/hot-source-settings"
import { prisma } from "@/lib/prisma"
import { authenticateRequest } from "@/lib/user-auth"

export const runtime = "nodejs"
export const maxDuration = 180

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getOptionalUser(request)
    const requestedEmail = user?.email || request.nextUrl.searchParams.get("accountEmail")?.trim() || ""
    const bindings = await loadEffectiveAccountSourceBindings()
    const accountEmails = Array.from(new Set([
      ...(user?.email ? [user.email] : []),
      ...bindings.map((entry) => entry.email),
    ])).filter(Boolean)
    const selectedEmail = accountEmails.includes(requestedEmail) ? requestedEmail : (user?.email || accountEmails[0] || "")
    const sources = selectedEmail ? sourcesForEmail(bindings, selectedEmail) : []
    const project = selectedEmail ? await findProjectForEmail(selectedEmail) : null
    const accounts = accountEmails.map((email) => ({
      email,
      label: email,
      selected: email === selectedEmail,
      sourceCount: sourcesForEmail(bindings, email).length,
    }))

    if (sources.length > 0) {
      const items = await fetchIndustryBriefingItems(sources[0], request.nextUrl.origin)
      const now = new Date()

      return NextResponse.json({
        data: {
          title: `${sources[0].source_name} · 行业热点`,
          date: now.toISOString().slice(0, 10),
          generatedAt: now.toISOString(),
          windowStart: "",
          windowEnd: now.toISOString(),
          markdown: "",
          audience: "client_industry",
          accountEmail: selectedEmail,
          accounts,
          sources,
          projectId: project?.id,
          projectName: project?.name || sources[0].source_name,
          items,
        },
      })
    }

    if (project) {
      const now = new Date()

      return NextResponse.json({
        data: {
          title: `每日选题 · ${project.name}行业热点`,
          date: now.toISOString().slice(0, 10),
          generatedAt: now.toISOString(),
          windowStart: "",
          windowEnd: now.toISOString(),
          markdown: "",
          audience: "client_industry",
          accountEmail: selectedEmail,
          accounts,
          sources,
          projectId: project.id,
          projectName: project.name,
          items: [],
        },
      })
    }

    const briefing = await getTodayAiHotBriefing()
    return NextResponse.json({ data: { ...briefing, audience: "self_media", accountEmail: selectedEmail, accounts, sources } })
  } catch (error) {
    console.error("[aihot-briefing/today] failed:", error)
    return NextResponse.json(
      { error: "AI HOT 简报暂时不可用，请稍后重试" },
      { status: 502 }
    )
  }
}

async function findProjectForEmail(email: string) {
  const owner = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  })
  if (!owner) return null
  return prisma.clientProject.findFirst({
    where: { userId: owner.id, status: "active" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      industry: true,
      targetCustomer: true,
      offer: true,
      deliveryGoal: true,
      notes: true,
    },
  })
}

async function getOptionalUser(request: NextRequest) {
  try {
    return await authenticateRequest(request, { requireActivation: false })
  } catch {
    return null
  }
}
