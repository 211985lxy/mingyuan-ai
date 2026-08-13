import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import { buildAimRelevantConversation } from "@/lib/aim/workbench-helpers"
import { buildAimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import type { ContentFormat } from "@/lib/api/client"

export function buildGenerationSourceEnvelope(input: {
  currentUserRequest: string
  messages: AimWorkbenchMessage[]
  editorText: string
  editorFormat?: ContentFormat
  existingGenerationId?: string
  sourceOriginalText: string
  sourceAnalysisText: string
}) {
  return buildAimContentSourceEnvelope({
    currentUserRequest: input.currentUserRequest,
    relevantConversation: buildAimRelevantConversation(input.messages),
    currentArtifact: input.editorText,
    currentArtifactFormat: input.editorFormat,
    currentArtifactGenerationId: input.existingGenerationId,
    referenceMaterials: [
      ...(input.sourceOriginalText.trim()
        ? [{ title: "用户参考原文", content: input.sourceOriginalText }]
        : []),
      ...(input.sourceAnalysisText.trim()
        ? [{ title: "用户参考分析", content: input.sourceAnalysisText }]
        : []),
    ],
  })
}
