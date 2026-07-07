import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { renderTemplate, validateVariables } from "@/lib/template-engine"
import type { TemplateVariable } from "@/types/content-template"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { variables } = await request.json()

  if (!variables || typeof variables !== "object") {
    return NextResponse.json(
      { error: "variables object is required" },
      { status: 400 }
    )
  }

  const template = await prisma.contentTemplate.findUnique({
    where: { id, status: "published" },
  })
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }

  // Validate required variables
  const definitions = Array.isArray(template.variables)
    ? (template.variables as unknown as TemplateVariable[])
    : []
  const missing = validateVariables(definitions, variables)
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required variables: ${missing.join(", ")}` },
      { status: 400 }
    )
  }

  // Render
  const rendered = renderTemplate(template.scriptTemplate, variables)

  // Increment usage count (fire-and-forget)
  prisma.contentTemplate
    .update({ where: { id }, data: { usageCount: { increment: 1 } } })
    .catch(() => {})

  return NextResponse.json({
    data: {
      script: rendered,
      templateId: id,
      templateName: template.displayName,
    },
  })
}
