import { createKnowledge } from "@/lib/api/knowledge"
import {
  buildExternalMemoryTags,
  sourceLabel,
  type ParsedExternalAiMemory,
} from "@/lib/knowledge/external-ai-memory-parse"

export async function persistExternalAiMemoryDrafts(input: {
  projectId: string
  parsed: ParsedExternalAiMemory
}): Promise<{ count: number; sourceLabel: string }> {
  for (const draft of input.parsed.drafts) {
    await createKnowledge({
      projectId: input.projectId,
      category: "positioning_material",
      title: draft.title,
      content: draft.content,
      tags: buildExternalMemoryTags(input.parsed.source, draft.sectionKey),
      sourceType: "import",
    })
  }
  return {
    count: input.parsed.drafts.length,
    sourceLabel: sourceLabel(input.parsed.source),
  }
}

export function validateExternalMemoryImport(input: {
  parsed: ParsedExternalAiMemory | null
  projectId: string
}): string | null {
  if (!input.parsed?.ok || input.parsed.drafts.length === 0) {
    return "请先解析粘贴内容"
  }
  if (!input.projectId) {
    return "定位素材必须绑定项目，请先选择项目"
  }
  return null
}
