import { polishScript, type AimGenerateResponse, type ContentFormat } from "@/lib/api/client"

const PROOFREAD_FORMATS = new Set<ContentFormat>(["raw_copy", "video_script", "koubo_script"])

/**
 * @description 对 AIM 生成响应进行校对润色
 * @param response - AIM 生成响应
 * @param persona - 人设描述
 * @returns 校对后的生成响应
 */
export async function proofreadAimResponse(response: AimGenerateResponse, persona: string): Promise<AimGenerateResponse> {
  if (response.fastPath) return response
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
