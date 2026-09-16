"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Loader2, RefreshCw, Volume2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { ModelSpeedCard, ScriptInputCard } from "@/components/voice/voice-studio-forms"
import { VoiceHistoryCard } from "@/components/voice/voice-history-card"
import { VoiceCloneButton } from "@/components/voice/voice-clone-dialog"
import { VoiceServiceNotice } from "@/components/voice/voice-service-notice"
import { useVoiceSamplePreview, VoicePickerList } from "@/components/voice/voice-sample-preview"
import {
  fetchVoiceModels,
  VOICE_MAX_TOTAL_LENGTH,
  type VoiceModelsResponse,
} from "@/lib/api/voice"
import { useSegmentedSynthesis } from "@/lib/voice/segmented-synthesis"
import { splitTextForSynthesis } from "@/lib/voice/segment-text"

interface SynthesizedInfo {
  charCount: number | null
  at: string
}

function useVoiceStudio() {
  const [text, setText] = useState("")
  const [scope, setScope] = useState<"all" | "mine">("all")
  const [models, setModels] = useState<VoiceModelsResponse | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [loadingModels, setLoadingModels] = useState(true)
  const [voiceId, setVoiceId] = useState("")
  const [tier, setTier] = useState("")
  const [speed, setSpeed] = useState(1)
  const [playerUrl, setPlayerUrl] = useState<string | null>(null)
  const [lastInfo, setLastInfo] = useState<SynthesizedInfo | null>(null)
  const [historyRefresh, setHistoryRefresh] = useState(0)

  const reloadModels = useCallback(async () => {
    setLoadingModels(true)
    setModelsError(null)
    try {
      const data = await fetchVoiceModels(scope)
      setModels(data)
      setTier((current) => current || data.defaultModel)
    } catch (error) {
      setModels(null)
      setModelsError(error instanceof Error ? error.message : "音色列表加载失败")
    } finally {
      setLoadingModels(false)
    }
  }, [scope])

  useEffect(() => {
    // 进页面先取一次音色列表；setState 都在 await 之后，不存在级联渲染
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadModels()
  }, [reloadModels])

  const onSynthesized = useCallback((payload: { objectUrl: string; charCount: number | null }) => {
    setPlayerUrl(payload.objectUrl)
    setLastInfo({ charCount: payload.charCount, at: new Date().toLocaleTimeString("zh-CN") })
  }, [])

  const onImported = useCallback(() => {
    setHistoryRefresh((current) => current + 1)
  }, [])

  return {
    historyRefresh,
    lastInfo,
    loadingModels,
    models,
    modelsError,
    onImported,
    onSynthesized,
    playerUrl,
    reloadModels,
    scope,
    setModelsError,
    setScope,
    setSpeed,
    setText,
    setTier,
    setVoiceId,
    speed,
    text,
    tier,
    voiceId,
  }
}

export default function VoiceStudioPage() {
  const studio = useVoiceStudio()
  const unconfigured = studio.models?.configured === false

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-10">
      <WorkbenchHero
        title="语音工坊"
        subtitle="把文案变成可试听的配音：先听顺不顺耳，再决定配不配进片子。音频只在当前页面生成，不入库、不外发。"
        badge={
          unconfigured ? (
            <Badge variant="secondary" className="text-destructive">
              未配置密钥
            </Badge>
          ) : (
            <Badge variant="secondary">Fish Audio</Badge>
          )
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => void studio.reloadModels()} disabled={studio.loadingModels}>
            <RefreshCw className={`h-3.5 w-3.5 ${studio.loadingModels ? "animate-spin" : ""}`} />
            刷新音色
          </Button>
        }
      />
      {unconfigured ? (
        <VoiceServiceNotice kind="unconfigured" message={studio.models?.reason ?? null} onRetry={() => void studio.reloadModels()} />
      ) : studio.modelsError ? (
        <VoiceServiceNotice kind="error" message={studio.modelsError} onRetry={() => void studio.reloadModels()} />
      ) : null}
      <ScriptInputCard text={studio.text} onChange={studio.setText} />
      <VoicePickerCard
        scope={studio.scope}
        onScopeChange={studio.setScope}
        voiceId={studio.voiceId}
        onVoiceChange={studio.setVoiceId}
        models={studio.models}
        loadingModels={studio.loadingModels}
        model={studio.tier}
        speed={studio.speed}
        onCloned={() => void studio.reloadModels()}
      />
      <ModelSpeedCard
        models={studio.models}
        tier={studio.tier}
        onTierChange={studio.setTier}
        speed={studio.speed}
        onSpeedChange={studio.setSpeed}
      />
      <ActionCard
        text={studio.text}
        voiceId={studio.voiceId}
        model={studio.tier}
        speed={studio.speed}
        configured={studio.models?.configured === true}
        playerUrl={studio.playerUrl}
        lastInfo={studio.lastInfo}
        onSynthesized={studio.onSynthesized}
        onImported={studio.onImported}
      />
      <VoiceHistoryCard refreshKey={studio.historyRefresh} />
    </div>
  )
}

function VoicePickerCard({
  scope,
  onScopeChange,
  voiceId,
  onVoiceChange,
  models,
  loadingModels,
  model,
  speed,
  onCloned,
}: {
  scope: "all" | "mine"
  onScopeChange: (value: "all" | "mine") => void
  voiceId: string
  onVoiceChange: (value: string) => void
  models: VoiceModelsResponse | null
  loadingModels: boolean
  model: string
  speed: number
  onCloned: () => void
}) {
  const preview = useVoiceSamplePreview(model, speed)
  // 记住选中音色的名称：切换公共库/我的音色后，已选音色可能不在当前列表里，
  // 不补回的话触发器会退化为显示原始模型 ID
  const [picked, setPicked] = useState<{ id: string; title: string } | null>(null)
  const voices = useMemo(() => models?.voices ?? [], [models])
  const options = useMemo(() => {
    if (!picked || voices.some((voice) => voice.id === picked.id)) return voices
    return [picked, ...voices]
  }, [picked, voices])

  function onVoicePick(value: string) {
    if (!value) {
      setPicked(null)
    } else {
      const title = voices.find((voice) => voice.id === value)?.title
      setPicked({ id: value, title: title || `音色 ${value.slice(0, 8)}…` })
    }
    onVoiceChange(value)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">音色</CardTitle>
        <CardDescription>平台默认音色优先；公共库已按热度精选热门中文音色，也可切「我的音色」。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <VoicePickerList
          options={options}
          voiceId={voiceId}
          onVoicePick={onVoicePick}
          preview={preview}
          disabled={loadingModels || !models?.configured}
        />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>音色范围</span>
          <Button
            variant={scope === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onScopeChange("all")}
          >
            公共库
          </Button>
          <Button
            variant={scope === "mine" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onScopeChange("mine")}
          >
            我的音色
          </Button>
          {scope === "mine" ? (
            <VoiceCloneButton onCloned={onCloned} />
          ) : null}
        </div>
        {models?.degraded && models.voices.length === 0 ? (
          <p className="text-xs text-muted-foreground">音色列表暂不可用，仍可用默认音色试听。</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ActionCard({
  text,
  voiceId,
  model,
  speed,
  configured,
  playerUrl,
  lastInfo,
  onSynthesized,
  onImported,
}: {
  text: string
  voiceId: string
  model: string
  speed: number
  configured: boolean
  playerUrl: string | null
  lastInfo: SynthesizedInfo | null
  onSynthesized: (payload: { objectUrl: string; charCount: number | null }) => void
  onImported: () => void
}) {
  const { phase, progress, error, generate } = useSegmentedSynthesis({
    onDone: onSynthesized,
    onSaved: onImported,
  })
  const charCount = text.trim().length
  const tooLong = charCount > VOICE_MAX_TOTAL_LENGTH
  const canSynthesize = configured && charCount > 0 && !tooLong && phase === "idle"
  const hint =
    charCount === 0
      ? "先输入文案"
      : tooLong
        ? `超出 ${VOICE_MAX_TOTAL_LENGTH} 字，请拆分后再试`
        : "等待音色列表就绪"
  const segments = splitTextForSynthesis(text).length

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            className="h-9 gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            disabled={!canSynthesize}
            onClick={() => void generate({ text, voiceId: voiceId || null, model: model || null, speed })}
          >
            {phase !== "idle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Volume2 className="h-4 w-4" />}
            {phase === "synthesizing"
              ? `合成中 ${progress.done}/${progress.total} 段`
              : phase === "saving"
                ? "保存中…"
                : "生成并试听"}
          </Button>
          {!canSynthesize && phase === "idle" ? (
            <span className="text-xs text-muted-foreground">{hint}</span>
          ) : null}
          {phase === "synthesizing" ? (
            <span className="text-xs text-muted-foreground">免费档较慢（约 12.5 字/秒），合成期间请勿关闭页面</span>
          ) : null}
          {lastInfo ? (
            <span className="text-xs text-muted-foreground">
              上次生成 {lastInfo.at}
              {lastInfo.charCount ? ` · ${lastInfo.charCount} 字` : ""}
            </span>
          ) : null}
        </div>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <p className="text-xs text-muted-foreground">
          {segments > 1 ? `本文将分 ${segments} 段顺序合成后自动拼接，` : ""}
          生成完成会自动存入「配音历史」，可随时回听、下载或删除。
        </p>
        {playerUrl ? (
          <audio controls src={playerUrl} className="w-full" preload="metadata">
            <track kind="captions" />
          </audio>
        ) : null}
      </CardContent>
    </Card>
  )
}
