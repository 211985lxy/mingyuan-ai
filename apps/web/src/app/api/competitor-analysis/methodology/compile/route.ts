import { parseCapabilityInput } from "@/lib/api/contracts"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm/client"
import {
// api-inventory: domain=competitor
// api-inventory: kind=capability
// api-inventory: orchestratable=true

  buildMethodologyCompilePrompt,
  parseMethodologyCompileResponse,
  type MethodologyCompileInput,
} from "@/lib/viral-methodology-compiler"

export const POST = withUserAuth(async (request) => {
  const { competitorAnalysisText, projectName, sourceCompetitorId } = (await parseCapabilityInput(
    "/api/competitor-analysis/methodology/compile",
    request
  )) as MethodologyCompileInput

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
