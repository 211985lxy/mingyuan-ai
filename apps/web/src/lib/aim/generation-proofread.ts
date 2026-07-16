import { polishScript, type AimGenerateResponse, type ContentFormat } from "@/lib/api/client"

const PROOFREAD_FORMATS = new Set<ContentFormat>(["raw_copy", "video_script", "koubo_script"])

export async function proofreadAimResponse(response: AimGenerateResponse, persona: string): Promise<AimGenerateResponse> {
  const results = await Promise.all(response.results.map(async (result) => {
    if (!PROOFREAD_FORMATS.has(result.format) || result.content.trim().length < 30) return result
    try {
      const polished = await polishScript({
        content: result.content,
        persona,
        mode: "proofread",
      })
      return {
        ...result,
        content: polished.polished,
        wordCount: polished.polished.length,
      }
    } catch {
      return result
    }
  }))
  return { ...response, results }
}
