import { runDouyinPublishCheck } from "@/lib/douyin-publish-check"
import { runQualityCheck, runQualityGateWithRewrite } from "@/lib/quality-gate"

type QualityInput = Parameters<typeof runQualityCheck>[0]

interface ScriptQualityCheckRequest {
  input: QualityInput
  autoRewrite: boolean
  publishPlatform?: "douyin"
}

type ParseResult =
  | { ok: true; value: ScriptQualityCheckRequest }
  | { ok: false; error: string }

function parsePersona(persona: unknown): QualityInput["persona"] {
  if (typeof persona === "string") return { oneLiner: persona }
  if (!persona || typeof persona !== "object") return undefined

  const record = persona as Record<string, unknown>
  return {
    roleType: typeof record.roleType === "string" ? record.roleType : undefined,
    oneLiner: typeof record.oneLiner === "string" ? record.oneLiner : undefined,
    toneOfVoice: typeof record.toneOfVoice === "string" ? record.toneOfVoice : undefined,
  }
}

/**
 * @description 解析scriptqualitycheckinput
 * @param body - 请求体
 * @returns ParseResult
 */
export function parseScriptQualityCheckInput(body: unknown): ParseResult {
  const record = (body ?? {}) as Record<string, unknown>
  const { content, topicTitle, openingType, structure, endingType, persona } = record
  const autoRewrite = record.autoRewrite ?? false
  const publishPlatform = record.publishPlatform

  if (!content || typeof content !== "string") {
    return { ok: false, error: "缺少文案内容 (content)" }
  }
  const stringFields: Array<[unknown, string]> = [
    [topicTitle, "topicTitle 必须是字符串"],
    [openingType, "openingType 必须是字符串"],
    [structure, "structure 必须是字符串"],
    [endingType, "endingType 必须是字符串"],
  ]
  for (const [value, error] of stringFields) {
    if (value != null && typeof value !== "string") return { ok: false, error }
  }
  if (persona != null && typeof persona !== "object" && typeof persona !== "string") {
    return { ok: false, error: "persona 必须是对象或字符串" }
  }
  if (typeof autoRewrite !== "boolean") {
    return { ok: false, error: "autoRewrite 必须是布尔值" }
  }
  if (publishPlatform != null && publishPlatform !== "douyin") {
    return { ok: false, error: "publishPlatform 暂只支持 douyin" }
  }

  return {
    ok: true,
    value: {
      input: {
        content,
        topicTitle: topicTitle as string | undefined,
        openingType: openingType as string | undefined,
        structure: structure as string | undefined,
        endingType: endingType as string | undefined,
        persona: parsePersona(persona),
      },
      autoRewrite,
      publishPlatform: publishPlatform as "douyin" | undefined,
    },
  }
}

/**
 * @description 运行scriptqualitycheck
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function runScriptQualityCheck(request: ScriptQualityCheckRequest) {
  const { input, autoRewrite, publishPlatform } = request
  if (autoRewrite) {
    const { content: finalContent, report } = await runQualityGateWithRewrite(input)
    return {
      success: true,
      data: {
        originalContent: input.content,
        content: finalContent,
        rewritten: finalContent !== input.content,
        report,
        publishCheck: publishPlatform === "douyin"
          ? runDouyinPublishCheck(finalContent)
          : undefined,
      },
    }
  }

  const report = await runQualityCheck(input)
  return {
    success: true,
    data: {
      content: input.content,
      report,
      publishCheck: publishPlatform === "douyin"
        ? runDouyinPublishCheck(input.content)
        : undefined,
    },
  }
}
