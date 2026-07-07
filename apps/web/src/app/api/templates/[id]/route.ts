import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const template = await prisma.contentTemplate.findUnique({
    where: { id, status: "published" },
    select: {
      id: true,
      displayName: true,
      description: true,
      scriptTemplate: true,
      expressionBlueprint: true,
      variables: true,
      hookType: true,
      shanjianStyleId: true,
      videoType: true,
      packRulesJson: true,
      processRulesJson: true,
      industry: true,
      contentType: true,
      tags: true,
      featured: true,
      usageCount: true,
    },
  })

  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ data: template })
}
