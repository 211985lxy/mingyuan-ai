import type { AimGenerateContext } from "./aim-agent-handlers"
import type { ContentFormat } from "./aim-generator"
import { isBenchmarkCopyTooSimilar } from "./aim-benchmark-quality"

const FIRST_PERSON_EVIDENCE_PATTERN = /(?:我有个|我身边有个|我的)(?:学员|客户|朋友|同事|下属)|我给你讲(?:个|一个|件|一件)真事|我们(?:公司|团队)(?:(?:去年|前阵子|之前)\s*)?(?:来|招|遇到|有)(?:了)?(?:个|一个|一位)|我(?:(?:曾经|以前|之前|亲自|亲眼)\s*)?(?:带过|帮过|服务过|辅导过|遇到过|见过|做过|认识)(?:一个|一位|不少|很多|太多|客户|企业|老板|团队|新人)|我(?:观察|接触|辅导|服务|带)(?:了)?(?:太多|很多|不少)(?:学员|客户|(?:职场)?新人|老板|企业|团队)/
const UNSUPPORTED_ANECDOTE_PATTERN = /我(?:上周|上个月|去年|前阵子|最近)[，,\s]*(?:帮|帮助|服务|辅导|带|见过|遇到|认识|接触|观察)(?:了|过)?|我[，,\s]*(?:帮|帮助|服务|辅导|带|见过|遇到|认识|接触|观察)(?:了|过)?(?:一家|一个|一位|有人|不少|很多|客户|公司|企业|老板|朋友|学员)|(?:上周|上个月|去年|前阵子|最近).{0,16}(?:客户|公司|企业|老板|朋友|学员)|(?:有|遇到|来了)(?:个|一个|一位|一家).{0,12}(?:客户|公司|企业|老板|朋友|学员)|(?:一个|一位|一家).{0,12}(?:客户|公司|企业|老板|朋友|学员).{0,24}(?:做了|发了|赚了|成交|询盘|增长|提升|降低|节省)/
const HYPOTHETICAL_MARKER_PATTERN = /假设|比如|例如|举例|如果|设想|虚构示例/

function containsUnsupportedAnecdote(text: string): boolean {
  return text
    .split(/(?<=[。！？!?；;\n])/)
    .some((sentence) =>
      !HYPOTHETICAL_MARKER_PATTERN.test(sentence)
      && (
        FIRST_PERSON_EVIDENCE_PATTERN.test(sentence)
        || UNSUPPORTED_ANECDOTE_PATTERN.test(sentence)
      ))
}

export function findUnsupportedFirstPersonClaimFormats(
  context: AimGenerateContext,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
): ContentFormat[] {
  const evidence = [
    context.rawInput,
    context.knowledgeBlock,
    context.ipWikiBlock,
    context.eventStorytellingBlock,
  ].filter(Boolean).join("\n")
  if (containsUnsupportedAnecdote(evidence)) return []

  return targetFormats.filter((format) =>
    containsUnsupportedAnecdote(parsed[format] || ""))
}

export function isGenericContentRequestWithoutFacts(
  context: Pick<
    AimGenerateContext,
    | "rawInput"
    | "knowledgeBlock"
    | "ipWikiBlock"
    | "topicTitle"
    | "topicRationale"
    | "hotTopic"
    | "taskSpec"
  >,
): boolean {
  const hasContext = Boolean(
    context.knowledgeBlock?.trim()
    || context.ipWikiBlock?.trim()
    || context.topicTitle?.trim()
    || context.topicRationale?.trim()
    || context.hotTopic?.trim()
    || context.taskSpec?.knownFacts?.length,
  )
  if (hasContext) return false
  const normalized = context.rawInput
    .trim()
    .replace(/[，。！？!?,.\s]/g, "")
  return /^(?:请|帮我|给我|麻烦)?(?:写|生成|出)(?:一版|一条|一个|一篇|个)?(?:短视频|视频|口播)?(?:脚本|文案|内容)$/.test(
    normalized,
  )
}

export function findLightEditScopeViolationFormats(
  context: Pick<
    AimGenerateContext,
    "rawInput" | "polishInstruction" | "runtimeTask"
  >,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
): ContentFormat[] {
  if (context.runtimeTask !== "light_edit") return []
  const instruction = `${context.rawInput}\n${context.polishInstruction || ""}`
  if (
    /精简|缩短|压缩|一句话|标题|开头|第一句|前三秒|前3秒|钩子|结尾|收尾|CTA/.test(
      instruction,
    )
  ) return []
  if (!/润色|文字二改|去\s*AI\s*味|这段|这篇|这段话/.test(instruction)) {
    return []
  }
  const sourceLength = context.rawInput
    .replace(/^【成稿】/, "")
    .trim()
    .length
  if (sourceLength < 12) return []
  const minimumLength = Math.floor(sourceLength * 0.72)
  return targetFormats.filter((format) =>
    (parsed[format] || "").trim().length < minimumLength)
}

export function inspectGenerationSafety(
  context: AimGenerateContext,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
) {
  const copiedFormats = context.runtimeTask === "light_edit"
    ? []
    : targetFormats.filter((format) =>
        isBenchmarkCopyTooSimilar(context.rawInput, parsed[format] || "")
      )
  return {
    copiedFormats,
    unsupportedClaimFormats: findUnsupportedFirstPersonClaimFormats(
      context,
      parsed,
      targetFormats,
    ),
    lightEditScopeViolationFormats: findLightEditScopeViolationFormats(
      context,
      parsed,
      targetFormats,
    ),
  }
}

export function buildGenerationSafetyRetryPrompt(
  userPrompt: string,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
  findings: ReturnType<typeof inspectGenerationSafety>,
): string {
  const previousOutput = targetFormats
    .map((format) => `===FORMAT:${format}===\n${parsed[format] || ""}`)
    .join("\n\n")
  const retryReasons = [
    findings.copiedFormats.length
      ? `上一版 ${findings.copiedFormats.join("、")} 与对标原文过于相似，判定为“几乎没改”。`
      : "",
    findings.unsupportedClaimFormats.length
      ? `上一版 ${findings.unsupportedClaimFormats.join("、")} 出现了上下文无依据的第一人称经历，判定为事实风险。`
      : "",
    findings.lightEditScopeViolationFormats.length
      ? `上一版 ${findings.lightEditScopeViolationFormats.join("、")} 在整段润色时删掉了原稿信息点或明显缩短篇幅。`
      : "",
  ].filter(Boolean).join("\n")

  return `${userPrompt}

【自动质检结果】
${retryReasons}
请重写全部请求格式：保留原选题、原稿全部信息点、结构节奏和目标字数；整段润色必须保持相近篇幅。禁止声称“真事”、“我们公司的人”或“我观察/带过很多人”。无依据的人物案例改为普遍现象、可验证方法或明确写出“假设”的举例。
除专有名词和固定产品名外，不要连续沿用原文 12 个字以上；不要只替换少量词。

上一版输出：
${previousOutput}`
}
