"use client"

import { useEffect, useRef, useState } from "react"
import { StepIndicator, type StudioStep } from "@/components/studio/step-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { loadAudioPrefs, saveAudioPrefs, useMounted } from "@/lib/studio/studio-prefs"
import { useSegmentAudio, type SegmentStatus } from "@/lib/voice/segment-audio"
import { AudioVoiceStep, useVoiceModels } from "@/features/studio/audio-voice-step"
import { AudioScriptStep } from "@/features/studio/audio-script-step"
import { AudioResultStep } from "@/features/studio/audio-result-step"
import { AudioSegmentEditor } from "@/features/studio/audio-segment-editor"

const AUDIO_STEPS: StudioStep[] = [
  { key: "voice", label: "选音色" },
  { key: "script", label: "念文案" },
  { key: "result", label: "出成品" },
]

/** 上次偏好（音色/档位/语速）作为默认值，挂载后只应用一次。 */
function useAudioPrefsInit(
  enabled: boolean,
  apply: (prefs: { voiceId?: string; tier?: string; speed?: number }) => void,
) {
  const appliedRef = useRef(false)
  useEffect(() => {
    if (!enabled || appliedRef.current) return
    appliedRef.current = true
    apply(loadAudioPrefs())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 只在挂载时应用一次
  }, [enabled])
}

/**
 * 音频工作台三步引导流：选音色 → 念文案 → 出成品。
 * 默认值来自上次使用（studio-prefs），主路径零配置。
 */
export function AudioWorkbench() {
  const mounted = useMounted()
  const [step, setStep] = useState(1)
  const [scope, setScope] = useState<"all" | "mine">("all")
  const { models, loadingModels, modelsError, reloadModels } = useVoiceModels(scope)
  const [voiceId, setVoiceId] = useState("")
  const [voiceTitle, setVoiceTitle] = useState("平台默认音色")
  const [tier, setTier] = useState("")
  const [speed, setSpeed] = useState(1)
  const [text, setText] = useState("")
  const [charCount, setCharCount] = useState<number | null>(null)

  useAudioPrefsInit(mounted, (prefs) => {
    if (prefs.voiceId) setVoiceId(prefs.voiceId)
    if (prefs.tier) setTier(prefs.tier)
    if (prefs.speed) setSpeed(prefs.speed)
  })

  const segmentAudio = useSegmentAudio()

  function handleGenerate() {
    const effectiveTier = tier || models?.defaultModel || ""
    saveAudioPrefs({ voiceId, tier: effectiveTier, speed })
    void segmentAudio
      .generateAll({ text, voiceId: voiceId || null, model: effectiveTier || null, speed })
      .then(() => {
        setCharCount(text.trim().length)
        setStep(3)
      })
  }

  // 进度由分段状态直接派生，避免维护两份状态
  const progress = {
    done: segmentAudio.statuses.filter((status) => status === "ready").length,
    total: segmentAudio.segments.length,
  }

  const view: AudioWorkbenchViewProps = {
    mounted,
    loadingFirstPage: loadingModels && !models,
    step,
    setStep,
    models,
    loadingModels,
    modelsError,
    scope,
    setScope,
    voiceId,
    setVoice: (id: string, title: string) => {
      setVoiceId(id)
      setVoiceTitle(title)
    },
    reloadModels: () => void reloadModels(),
    voiceTitle,
    text,
    setText,
    tier,
    setTier,
    speed,
    setSpeed,
    busy: segmentAudio.busy,
    progress,
    error: segmentAudio.error,
    onGenerate: handleGenerate,
    combinedUrl: segmentAudio.combinedUrl,
    segments: segmentAudio.segments,
    statuses: segmentAudio.statuses,
    segmentUrls: segmentAudio.segmentUrls,
    onRegenerateSegment: (index: number) => void segmentAudio.regenerateSegment(index),
    onSegmentTextChange: segmentAudio.updateSegmentText,
    segmentVoices: segmentAudio.segmentVoices,
    availableVoices: models?.voices ?? [],
    onSegmentVoiceChange: segmentAudio.updateSegmentVoice,
    charCount,
  }
  return <AudioWorkbenchView {...view} />
}

interface AudioWorkbenchViewProps {
  mounted: boolean
  loadingFirstPage: boolean
  step: number
  setStep: (step: number) => void
  models: ReturnType<typeof useVoiceModels>["models"]
  loadingModels: boolean
  modelsError: string | null
  scope: "all" | "mine"
  setScope: (scope: "all" | "mine") => void
  voiceId: string
  setVoice: (id: string, title: string) => void
  reloadModels: () => void
  voiceTitle: string
  text: string
  setText: (text: string) => void
  tier: string
  setTier: (tier: string) => void
  speed: number
  setSpeed: (speed: number) => void
  busy: boolean
  progress: { done: number; total: number }
  error: string | null
  onGenerate: () => void
  combinedUrl: string | null
  segments: string[]
  statuses: SegmentStatus[]
  segmentUrls: (string | null)[]
  onRegenerateSegment: (index: number) => void
  onSegmentTextChange: (index: number, text: string) => void
  segmentVoices: (string | null)[]
  availableVoices: Array<{ id: string; title: string }>
  onSegmentVoiceChange: (index: number, voiceId: string | null) => void
  charCount: number | null
}

/** Step 3：成品（或失败提示）+ 分段编辑。 */
function AudioResultSection({ props }: { props: AudioWorkbenchViewProps }) {
  return (
    <>
      {props.combinedUrl ? (
        <AudioResultStep
          playerUrl={props.combinedUrl}
          charCount={props.charCount}
          script={props.text}
          onReedit={() => props.setStep(2)}
        />
      ) : (
        <p className="text-sm text-destructive" role="alert">
          有段落未生成成功，无法产出完整音频。请在下方逐段重试。
        </p>
      )}
      <AudioSegmentEditor
        segments={props.segments}
        statuses={props.statuses}
        segmentUrls={props.segmentUrls}
        busy={props.busy}
        onRegenerate={props.onRegenerateSegment}
        onTextChange={props.onSegmentTextChange}
        segmentVoices={props.segmentVoices}
        voices={props.availableVoices}
        defaultVoiceTitle={props.voiceTitle}
        onVoiceChange={props.onSegmentVoiceChange}
      />
    </>
  )
}

function AudioWorkbenchSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function AudioWorkbenchView(props: AudioWorkbenchViewProps) {
  if (!props.mounted || props.loadingFirstPage) return <AudioWorkbenchSkeleton />
  const effectiveTier = props.tier || props.models?.defaultModel || ""

  return (
    <div className="space-y-7">
      <div className="flex justify-center">
        <StepIndicator
          steps={AUDIO_STEPS}
          current={props.step}
          onStepClick={(next) => next < props.step && props.setStep(next)}
        />
      </div>

      {props.step === 1 ? (
        <AudioVoiceStep
          models={props.models}
          loadingModels={props.loadingModels}
          modelsError={props.modelsError}
          scope={props.scope}
          onScopeChange={props.setScope}
          voiceId={props.voiceId}
          onVoicePick={props.setVoice}
          onCloned={props.reloadModels}
          onNext={() => props.setStep(2)}
        />
      ) : null}

      {props.step === 2 ? (
        <AudioScriptStep
          text={props.text}
          onTextChange={props.setText}
          models={props.models}
          tier={effectiveTier}
          onTierChange={props.setTier}
          speed={props.speed}
          onSpeedChange={props.setSpeed}
          phase={props.busy ? "synthesizing" : "idle"}
          progress={props.progress}
          error={props.error}
          onGenerate={props.onGenerate}
          onBack={() => props.setStep(1)}
        />
      ) : null}

      {props.step === 3 ? <AudioResultSection props={props} /> : null}

      {props.step === 2 ? (
        <p className="text-center text-xs text-muted-foreground">
          当前音色：{props.voiceTitle}
        </p>
      ) : null}
    </div>
  )
}
