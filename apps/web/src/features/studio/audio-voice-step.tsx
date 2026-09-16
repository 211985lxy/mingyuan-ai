"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { VoiceServiceNotice } from "@/components/voice/voice-service-notice"
import { VoiceCloneButton } from "@/components/voice/voice-clone-dialog"
import { useVoiceSamplePreview, VoicePickerList } from "@/components/voice/voice-sample-preview"
import { fetchVoiceModels, type VoiceModelsResponse } from "@/lib/api/voice"

/** Step 1 选音色：一屏只回答「用谁的声音」。 */
export function AudioVoiceStep({
  models,
  loadingModels,
  modelsError,
  scope,
  onScopeChange,
  voiceId,
  onVoicePick,
  onCloned,
  onNext,
}: {
  models: VoiceModelsResponse | null
  loadingModels: boolean
  modelsError: string | null
  scope: "all" | "mine"
  onScopeChange: (scope: "all" | "mine") => void
  voiceId: string
  onVoicePick: (voiceId: string, title: string) => void
  onCloned: () => void
  onNext: () => void
}) {
  const preview = useVoiceSamplePreview(
    useMemo(() => models?.defaultModel ?? null, [models]),
    1,
  )

  if (models && models.configured === false) {
    return <VoiceServiceNotice kind="unconfigured" message={models.reason ?? null} onRetry={onCloned} />
  }
  if (modelsError) {
    return <VoiceServiceNotice kind="error" message={modelsError} onRetry={onCloned} />
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">选择音色</h2>
        <p className="text-sm text-muted-foreground">点名字即可选中，▶ 可先试听 5 秒样音。</p>
      </header>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button
          type="button"
          variant={scope === "all" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onScopeChange("all")}
        >
          公共音色
        </Button>
        <Button
          type="button"
          variant={scope === "mine" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onScopeChange("mine")}
        >
          我的音色
        </Button>
        {scope === "mine" ? <VoiceCloneButton onCloned={onCloned} /> : null}
      </div>
      <VoicePickerList
        options={models?.voices ?? []}
        voiceId={voiceId}
        onVoicePick={(id) => {
          const title = id === "" ? "平台默认音色" : models?.voices.find((voice) => voice.id === id)?.title
          onVoicePick(id, title || `音色 ${id.slice(0, 8)}…`)
        }}
        preview={preview}
        disabled={loadingModels || models?.configured === false}
      />
      <div className="flex justify-end">
        <Button type="button" onClick={onNext}>
          下一步：念文案
        </Button>
      </div>
    </section>
  )
}

/** 挂载时拉取音色列表；scope 切换时重拉。 */
export function useVoiceModels(scope: "all" | "mine") {
  const [models, setModels] = useState<VoiceModelsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setModels(await fetchVoiceModels(scope))
    } catch (caught) {
      setModels(null)
      setError(caught instanceof Error ? caught.message : "音色列表加载失败")
    } finally {
      setLoading(false)
    }
  }, [scope])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 进页面先取音色列表（仓库惯例 warn 放行）
    void reload()
  }, [reload])

  return { models, loadingModels: loading, modelsError: error, reloadModels: reload }
}
