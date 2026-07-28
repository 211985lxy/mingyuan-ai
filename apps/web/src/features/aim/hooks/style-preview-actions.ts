"use client"

import { toast } from "sonner"

import { commitStyleProfile, previewStyleProfile } from "@/lib/api/aim"
import type { StyleProfileDelta } from "@/lib/aim-style-evolution"
import {
  dimHasContent,
  STYLE_DIMENSION_LABELS,
} from "@/features/aim/hooks/style-preview-helpers"

export async function runStylePreviewAnalysis(input: {
  samples: Array<{ content: string; label?: "core" | "normal" }>
  projectId?: string | null
}): Promise<{ delta: StyleProfileDelta | null; error: string | null }> {
  try {
    const result = await previewStyleProfile({
      samples: input.samples,
      projectId: input.projectId || undefined,
    })
    if (!result.delta) {
      return {
        delta: null,
        error: result.reason === "no_style"
          ? "这些样本里还看不出稳定风格，换几篇再试"
          : "风格分析没有产出候选",
      }
    }
    return { delta: result.delta as StyleProfileDelta, error: null }
  } catch (err) {
    return {
      delta: null,
      error: err instanceof Error ? err.message : "风格分析失败，内容还在，可重试",
    }
  }
}

export function buildCommitDeltaFromSelection(
  delta: StyleProfileDelta,
  enabledKeys: Set<string>,
): StyleProfileDelta | null {
  const next: StyleProfileDelta = {
    cognitivePattern: enabledKeys.has("cognitivePattern") ? delta.cognitivePattern : {},
    emotionalTexture: enabledKeys.has("emotionalTexture") ? delta.emotionalTexture : {},
    structuralDna: enabledKeys.has("structuralDna") ? delta.structuralDna : {},
    microLinguistics: enabledKeys.has("microLinguistics") ? delta.microLinguistics : {},
    coreValues: enabledKeys.has("coreValues") ? delta.coreValues : {},
    decisionHeuristics: enabledKeys.has("decisionHeuristics") ? delta.decisionHeuristics : {},
    antiPatterns: enabledKeys.has("antiPatterns") ? delta.antiPatterns : {},
    honestLimits: enabledKeys.has("honestLimits") ? delta.honestLimits : {},
    evidence: delta.evidence,
    confidence: delta.confidence,
  }
  return STYLE_DIMENSION_LABELS.some(({ key }) => dimHasContent(next[key])) ? next : null
}

export async function commitSelectedStyleDelta(input: {
  delta: StyleProfileDelta
  enabledKeys: Set<string>
  projectId?: string | null
}): Promise<{ ok: true; created: boolean } | { ok: false; message: string }> {
  const payload = buildCommitDeltaFromSelection(input.delta, input.enabledKeys)
  if (!payload) return { ok: false, message: "请至少保留一个风格维度" }
  try {
    const result = await commitStyleProfile({
      delta: payload,
      projectId: input.projectId || undefined,
    })
    if (!result.profile) return { ok: false, message: "写入失败，原风格档案未改动" }
    toast.success(result.created ? "已建立表达风格档案" : "表达风格档案已更新")
    return { ok: true, created: Boolean(result.created) }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "写入失败，原风格档案未改动",
    }
  }
}
