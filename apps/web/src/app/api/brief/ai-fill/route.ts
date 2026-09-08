import { parseCapabilityInput } from "@/lib/api/contracts"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm/client"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"
import type { ExpressionBlueprint, TemplateVariable } from "@/types/content-template"
// api-inventory: domain=brief
// api-inventory: kind=capability
// api-inventory: orchestratable=true


export const POST = withUserAuth(async (request) => {
  const body = (await parseCapabilityInput("/api/brief/ai-fill", request)) as {
    templateId: string
    userInput: string
  }
  const templateId = body.templateId
  const userInput = body.userInput.trim()

  const template = await prisma.contentTemplate.findUnique({
    where: { id: templateId, status: "published" },
    select: {
      id: true,
      displayName: true,
      description: true,
      expressionBlueprint: true,
      variables: true,
    },
  })

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }

  const variables = Array.isArray(template.variables)
    ? (template.variables as unknown as TemplateVariable[])
    : []

  if (variables.length === 0) {
    return NextResponse.json({ data: { filledInputs: {} } })
  }

  const ipContext = ""

  const variableDescriptions = variables
    .map(
      (v) =>
        `- "${v.key}": ${v.label}${v.required ? "（必填）" : "（选填）"}，示例：${v.placeholder}${v.options ? `，可选值：${v.options.join("、")}` : ""}`,
    )
    .join("\n")

  const expressionBlueprint = template.expressionBlueprint as ExpressionBlueprint | null

  const systemPrompt = fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.briefAiFillSystem).content,
    {
      templateName: template.displayName,
      templateDescriptionBlock: template.description ? `模板描述：${template.description}` : "",
      expressionBlueprintBlock: expressionBlueprint
        ? `表达蓝图：论证模式=${expressionBlueprint.argumentPattern}；证据要求=${expressionBlueprint.proofBurden}；CTA=${expressionBlueprint.ctaStyle}`
        : "",
      ipContext,
      variableDescriptions,
    },
  )

  const userPrompt = userInput
    ? fillPromptTemplate(promptRegistry.get(PROMPT_KEYS.briefAiFillUserInput).content, { userInput })
    : promptRegistry.get(PROMPT_KEYS.briefAiFillUserNoInput).content

  const llm = LLMClient.shared()
  if (!llm.available) {
    return NextResponse.json(
      { error: "AI service unavailable" },
      { status: 503 },
    )
  }

  try {
    const result = await llm.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 1024,
      responseFormat: { type: "json_object" },
    })

    const filledInputs: Record<string, string> = {}
    try {
      // Strip markdown code fences if present (LLM sometimes wraps JSON)
      let raw = result.content.trim()
      const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (fenceMatch) {
        raw = fenceMatch[1].trim()
      }
      const parsed = JSON.parse(raw)
      // Only keep keys that match template variables
      const validKeys = new Set(variables.map((v) => v.key))
      for (const [key, value] of Object.entries(parsed)) {
        if (validKeys.has(key) && typeof value === "string" && value.trim()) {
          filledInputs[key] = value.trim()
        }
      }
    } catch {
      console.error("[ai-fill-brief] Parse failed. Raw:", result.content)
      return NextResponse.json(
        { error: "AI response parsing failed" },
        { status: 500 },
      )
    }

    return NextResponse.json({ data: { filledInputs } })
  } catch (e) {
    console.error("[ai-fill-brief] LLM error:", e)
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 },
    )
  }
})
