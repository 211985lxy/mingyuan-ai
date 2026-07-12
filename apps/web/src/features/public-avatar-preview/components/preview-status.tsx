import type { RefObject } from "react"
import { Button } from "@/components/ui/button"
import type { ApiPublicAvatarPreview } from "@/types/api"

export function PreviewStatus({
  preview,
  previewError,
  isHydratingDefaults,
  defaultsLoadError,
  hasLoadedCachedPreview,
  hasPreviewConfigChanged,
  showBackgroundHint,
  videoRef,
  onReloadDefaults,
}: {
  preview: ApiPublicAvatarPreview | null
  previewError: string | null
  isHydratingDefaults: boolean
  defaultsLoadError: string | null
  hasLoadedCachedPreview: boolean
  hasPreviewConfigChanged: boolean
  showBackgroundHint: boolean
  videoRef: RefObject<HTMLVideoElement | null>
  onReloadDefaults: () => void
}) {
  return (
    <>
      {previewError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{previewError}</div>}
      {isHydratingDefaults && !preview && <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">正在读取你上次生成过的试看配置...</div>}
      {defaultsLoadError && !preview && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{defaultsLoadError}</span>
          <Button type="button" variant="ghost" size="sm" onClick={onReloadDefaults} className="cursor-pointer text-amber-900 hover:text-amber-900">重新加载上次试看</Button>
        </div>
      )}
      {preview?.status === "failed" && preview.errorMessage && !previewError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{preview.errorMessage}</div>}
      {hasLoadedCachedPreview && !hasPreviewConfigChanged && (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between">
          <span>已直接载入你上次生成过的试看，点左侧播放即可查看。</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => videoRef.current?.play().catch(() => {})} className="cursor-pointer text-emerald-900 hover:text-emerald-900">播放上次试看</Button>
        </div>
      )}
      {preview?.status === "processing" && showBackgroundHint && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">后台会继续生成，关闭弹窗不会中断处理。你稍后再回来时，如果结果已经完成，会自动直接显示。</div>}
    </>
  )
}
