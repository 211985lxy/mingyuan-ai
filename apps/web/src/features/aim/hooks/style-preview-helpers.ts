import type { StyleProfileDelta } from "@/lib/aim-style-evolution"

export const STYLE_DIMENSION_LABELS: Array<{
  key: keyof Omit<StyleProfileDelta, "evidence" | "confidence">
  label: string
}> = [
  { key: "cognitivePattern", label: "认知切入" },
  { key: "emotionalTexture", label: "情绪质感" },
  { key: "structuralDna", label: "结构 DNA" },
  { key: "microLinguistics", label: "微观语感" },
  { key: "coreValues", label: "核心价值" },
  { key: "decisionHeuristics", label: "判断启发式" },
  { key: "antiPatterns", label: "反模式" },
  { key: "honestLimits", label: "诚实边界" },
]

export function dimHasContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  return Object.values(value as Record<string, unknown>).some(
    (v) => typeof v === "string" && v.trim().length > 0,
  )
}

export function formatStyleDim(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("；")
}
