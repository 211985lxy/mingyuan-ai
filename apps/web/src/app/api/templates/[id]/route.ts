import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * @description 处理 GET 请求
 * @param _request - _request
 * @param options - 配置选项
 * @returns 无返回值
 */
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
