import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm/client"
import type { ExpressionBlueprint, TemplateVariable } from "@/types/content-template"

export const POST = withUserAuth(async (request) => {
  const body = await request.json()
  const templateId = typeof body.templateId === "string" ? body.templateId : ""
  const userInput = typeof body.userInput === "string" ? body.userInput.trim() : ""

  if (!templateId) {
    return NextResponse.json(
      { error: "templateId is required" },
      { status: 400 },
    )
  }

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

  const systemPrompt = `你是一个营销文案助手。用户正在填写一个视频创作的 Brief 表单。
你需要根据用户提供的简要描述和 IP 档案信息，智能推测并填写表单中的各个字段。

表达模板：${template.displayName}
${template.description ? `模板描述：${template.description}` : ""}
${expressionBlueprint ? `表达蓝图：论证模式=${expressionBlueprint.argumentPattern}；证据要求=${expressionBlueprint.proofBurden}；CTA=${expressionBlueprint.ctaStyle}` : ""}

IP 档案信息：
${ipContext}

需要填写的字段：
${variableDescriptions}

规则：
1. 行业身份只来自 IP 档案，不要把“行业”当成 Brief 字段去凭空补充
2. 根据用户输入和 IP 档案信息，尽可能合理地填写每个字段
3. 如果用户输入中明确提到了某个字段的值，直接使用
4. 如果没有明确提到，根据 IP 档案和上下文推测一个合理的值
5. 文案要简洁有力，符合营销短视频风格
6. 必须返回 JSON 格式，key 为字段 key，value 为填写的内容
7. 只返回 JSON，不要任何其他内容`

  const userPrompt = userInput
    ? `用户描述了本条视频想讲的内容：\n\n"${userInput}"\n\n请据此填写 Brief 表单各字段。`
    : "用户未提供本条视频的具体描述，请根据 IP 档案信息和表达模板推测并填写 Brief 表单各字段。"

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
