"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { commitStyleProfile, previewStyleProfile } from "@/lib/api/aim"
import type { StyleProfileDelta } from "@/lib/aim-style-evolution"
import { cn } from "@/lib/utils"

const DIMENSION_LABELS: Array<{ key: keyof Omit<StyleProfileDelta, "evidence" | "confidence">; label: string }> = [
  { key: "cognitivePattern", label: "认知切入" },
  { key: "emotionalTexture", label: "情绪质感" },
  { key: "structuralDna", label: "结构 DNA" },
  { key: "microLinguistics", label: "微观语感" },
  { key: "coreValues", label: "核心价值" },
  { key: "decisionHeuristics", label: "判断启发式" },
  { key: "antiPatterns", label: "反模式" },
  { key: "honestLimits", label: "诚实边界" },
]

function dimHasContent(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  return Object.values(value as Record<string, unknown>).some(
    (v) => typeof v === "string" && v.trim().length > 0,
  )
}

function formatDim(value: unknown): string {
  if (!value || typeof value !== "object") return ""
  return Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${String(v).trim()}`)
    .join("；")
}

export interface AimStylePreviewDialogProps {
  open: boolean
  samples: Array<{ content: string; label?: "core" | "normal" }>
  projectId?: string | null
  onOpenChange: (open: boolean) => void
  onCommitted?: () => void
}

/**
 * 风格分析预览：先看八维候选，用户可取消错误维度后再确认写库。
 */
export function AimStylePreviewDialog({
  open,
  samples,
  projectId,
  onOpenChange,
  onCommitted,
}: AimStylePreviewDialogProps) {
  const [loading, setLoading] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [delta, setDelta] = useState<StyleProfileDelta | null>(null)
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  async function runPreview() {
    setLoading(true)
    setError(null)
    setDelta(null)
    try {
      const result = await previewStyleProfile({
        samples,
        projectId: projectId || undefined,
      })
      if (!result.delta) {
        setError(result.reason === "no_style" ? "这些样本里还看不出稳定风格，换几篇再试" : "风格分析没有产出候选")
        return
      }
      const full = result.delta as StyleProfileDelta
      setDelta(full)
      const keys = new Set(
        DIMENSION_LABELS.filter(({ key }) => dimHasContent(full[key])).map(({ key }) => key),
      )
      setEnabledKeys(keys)
    } catch (err) {
      setError(err instanceof Error ? err.message : "风格分析失败，内容还在，可重试")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open || samples.length === 0) return
    void runPreview()
    // 仅在打开时触发；samples 由调用方在打开时固定
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggleKey(key: string) {
    setEnabledKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function buildCommitDelta(): StyleProfileDelta | null {
    if (!delta) return null
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
    const any = DIMENSION_LABELS.some(({ key }) => dimHasContent(next[key]))
    return any ? next : null
  }

  async function handleCommit() {
    const payload = buildCommitDelta()
    if (!payload) {
      toast.error("请至少保留一个风格维度")
      return
    }
    setCommitting(true)
    try {
      const result = await commitStyleProfile({
        delta: payload,
        projectId: projectId || undefined,
      })
      if (!result.profile) {
        toast.error("写入失败，原风格档案未改动")
        return
      }
      toast.success(result.created ? "已建立表达风格档案" : "表达风格档案已更新")
      onOpenChange(false)
      setDelta(null)
      onCommitted?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "写入失败，原风格档案未改动")
    } finally {
      setCommitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setDelta(null)
          setError(null)
          setEnabledKeys(new Set())
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>风格分析预览</DialogTitle>
          <DialogDescription>
            先看提炼结果，确认后再写入「我的表达风格」。取消不会改动现有档案。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            正在分析风格…
          </div>
        ) : null}

        {error ? (
          <div className="space-y-3 py-4">
            <p className="text-sm text-destructive">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void runPreview()}>
              重试分析
            </Button>
          </div>
        ) : null}

        {delta ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              置信度：{delta.confidence} · 证据：{delta.evidence}
            </p>
            {DIMENSION_LABELS.map(({ key, label }) => {
              const filled = dimHasContent(delta[key])
              if (!filled) return null
              const enabled = enabledKeys.has(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleKey(key)}
                  className={cn(
                    "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                    enabled ? "border-primary/40 bg-primary/5" : "border-border bg-muted/30 opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{label}</span>
                    <span className="text-xs text-muted-foreground">{enabled ? "保留" : "已取消"}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{formatDim(delta[key])}</p>
                </button>
              )
            })}
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={committing}>
            取消
          </Button>
          <Button
            type="button"
            onClick={() => void handleCommit()}
            disabled={!delta || committing || loading}
          >
            {committing ? "写入中…" : "确认写入风格档案"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
