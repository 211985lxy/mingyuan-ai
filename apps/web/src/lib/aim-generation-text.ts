import type { AimGenerateContext } from "./aim-agent-handlers"

const METHOD_NOTE_BLOCK_PATTERN = /\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/u

export function withoutMethodNote(content: string): string {
  return content.replace(METHOD_NOTE_BLOCK_PATTERN, "").trim()
}

export function deliveryBody(content: string): string {
  return withoutMethodNote(content)
    .replace(/===FORMAT(?::[^=\n]+)?===/gu, "")
    .trim()
}

export function scrubLeakedLightEditFeedback(content: string, rawInput: string): string {
  if (!/原稿[:：]/u.test(rawInput)) return content
  const feedback = rawInput.match(
    /(?:但|不过)?(?:这段|这句|这个开头|这篇)(?:话|文案|表达)?(?:太空|太泛|太弱|太平|不好|不够[^。！？!?]{0,12})[。！？!?]?/gu,
  ) ?? []
  if (!feedback.length) return content
  const methodNote = content.match(METHOD_NOTE_BLOCK_PATTERN)?.[0]
  let body = withoutMethodNote(content)
  for (const phrase of feedback) body = body.replaceAll(phrase, "")
  body = body.replace(/[，,]\s*[。！？!?]/gu, "。").replace(/[，,]\s*$/u, "。").trim()
  return [methodNote, body].filter(Boolean).join("\n\n")
}

export function buildGenerationNumericEvidence(context: Pick<
  AimGenerateContext,
  "rawInput" | "knowledgeBlock" | "ipWikiBlock" | "eventStorytellingBlock" | "taskSpec"
>): string {
  return [context.rawInput, context.knowledgeBlock, context.ipWikiBlock,
    context.eventStorytellingBlock,
    ...(context.taskSpec?.knownFacts?.map((fact) => fact.statement) ?? []),
  ].filter(Boolean).join("\n")
}
