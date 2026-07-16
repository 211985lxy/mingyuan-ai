import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm/client"
import {
  buildMethodologyCompilePrompt,
  parseMethodologyCompileResponse,
  type MethodologyCompileInput,
} from "@/lib/viral-methodology-compiler"

export const POST = withUserAuth(async (request) => {
  const body = await parseJsonRecord(request)
  const { competitorAnalysisText, projectName, sourceCompetitorId } =
    body as MethodologyCompileInput

  if (!competitorAnalysisText?.trim()) {
    return NextResponse.json(
      { error: "competitorAnalysisText is required" },
      { status: 400 }
    )
  }

  const prompt = buildMethodologyCompilePrompt({
    competitorAnalysisText,
    projectName,
    sourceCompetitorId,
  })

  const completion = await LLMClient.shared().complete({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    maxTokens: 4000,
  })

  const proposedPages = parseMethodologyCompileResponse(completion.content)

  return NextResponse.json({ proposedPages })
})
