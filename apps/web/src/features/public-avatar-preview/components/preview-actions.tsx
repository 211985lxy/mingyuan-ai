import { Check, Loader2, Sparkles, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ApiPublicAvatarPreview } from "@/types/api"

export function PreviewActions({
  preview,
  isSubmitting,
  hasLoadedCachedPreview,
  hasPreviewConfigChanged,
  resolvedVoiceId,
  showBackgroundHint,
  applyLabel,
  onGenerate,
  onApply,
  onClose,
}: {
  preview: ApiPublicAvatarPreview | null
  isSubmitting: boolean
  hasLoadedCachedPreview: boolean
  hasPreviewConfigChanged: boolean
  resolvedVoiceId: string | null
  showBackgroundHint: boolean
  applyLabel?: string
  onGenerate: () => void
  onApply?: () => void
  onClose: () => void
}) {
  return (
    <>
      <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center">
        <Button type="button" onClick={onGenerate} disabled={!resolvedVoiceId || isSubmitting || (hasLoadedCachedPreview && !hasPreviewConfigChanged)} className="cursor-pointer gap-2" variant={hasLoadedCachedPreview && !hasPreviewConfigChanged ? "outline" : undefined}>
          {isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />{showBackgroundHint ? "后台处理中，可先离开" : "处理中"}</> : hasLoadedCachedPreview && !hasPreviewConfigChanged ? <><Check className="h-4 w-4" />已加载上次试看</> : hasLoadedCachedPreview ? <><Sparkles className="h-4 w-4" />生成新的试看</> : <><Sparkles className="h-4 w-4" />生成口播试看</>}
        </Button>
        {onApply && <Button type="button" variant="outline" onClick={onApply} className="cursor-pointer gap-2"><Check className="h-4 w-4" />{applyLabel ?? "选用这个数字人"}</Button>}
        {preview?.status === "processing" && showBackgroundHint && <Button type="button" variant="ghost" onClick={onClose} className="cursor-pointer">先去选别的数字人</Button>}
      </div>
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2"><Volume2 className="h-3.5 w-3.5" /><span>这不是正式出片，只是帮你确认“这张脸 + 这条声线 + 这句文案”是否匹配。</span></div>
      </div>
    </>
  )
}
