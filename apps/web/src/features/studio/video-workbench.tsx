"use client"

import { useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { StepIndicator, type StudioStep } from "@/components/studio/step-indicator"
import { Skeleton } from "@/components/ui/skeleton"
import { createVideoTask } from "@/lib/api/client"
import { clearVideoHandoff, saveVideoPrefs, useMounted } from "@/lib/studio/studio-prefs"
import type { PublicDigitalPersonOption } from "@/lib/api/digital-human"
import {
  buildCreateVideoTaskInput,
  pickFigureType,
  resolveVideoWorkbenchInit,
  useScriptPreview,
  useStudioFishVoices,
  useStudioProjects,
  useStudioPublicPersons,
  useStudioVideoTask,
  useVideoAvatarLibrary,
  validateVideoSubmission,
} from "@/features/studio/video-workbench-data"
import { VideoAvatarStep, type AvatarSource } from "@/features/studio/video-avatar-step"
import { VideoScriptStep, type VideoVoiceSource } from "@/features/studio/video-script-step"
import { VideoReviewStep } from "@/features/studio/video-review-step"

const VIDEO_STEPS: StudioStep[] = [
  { key: "avatar", label: "选形象" },
  { key: "script", label: "声音文案" },
  { key: "review", label: "出成片" },
]

/**
 * 视频工作台三步引导流：选形象 → 声音与文案 → 确认出片。
 * 深链（AIM 去工坊出片 / 音频升级为视频）可携带文案直达第 2 步。
 */
export function VideoWorkbench() {
  const vm = useVideoWorkbenchModel()
  return <VideoWorkbenchView vm={vm} />
}

interface VideoWorkbenchModel {
  mounted: boolean
  step: number
  setStep: (step: number) => void
  projects: ReturnType<typeof useStudioProjects>["projects"]
  projectId: string
  setProjectId: (id: string) => void
  avatarSource: AvatarSource
  setAvatarSource: (source: AvatarSource) => void
  avatarLibrary: ReturnType<typeof useVideoAvatarLibrary>
  publicPersons: ReturnType<typeof useStudioPublicPersons>["publicPersons"]
  loadingPublic: boolean
  selectedPublic: PublicDigitalPersonOption | null
  setSelectedPublic: (person: PublicDigitalPersonOption) => void
  script: string
  setScript: (script: string) => void
  voiceSource: VideoVoiceSource
  setVoiceSource: (source: VideoVoiceSource) => void
  fishVoiceId: string
  setFishVoiceId: (id: string) => void
  fishVoices: ReturnType<typeof useStudioFishVoices>["fishVoices"]
  aspectRatio: "9:16" | "16:9"
  setAspectRatio: (ratio: "9:16" | "16:9") => void
  naturalMotion: boolean
  setNaturalMotion: (value: boolean) => void
  previewUrl: string | null
  previewing: boolean
  onPreview: () => void
  submitting: boolean
  task: ReturnType<typeof useStudioVideoTask>["task"]
  onSubmit: () => void
}

function useVideoWorkbenchModel(): VideoWorkbenchModel {
  const mounted = useMounted()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)
  const [projectId, setProjectId] = useState("")
  const [avatarSource, setAvatarSource] = useState<AvatarSource>("mine")
  const [selectedPublic, setSelectedPublic] = useState<PublicDigitalPersonOption | null>(null)
  const [script, setScript] = useState("")
  const [voiceSource, setVoiceSource] = useState<VideoVoiceSource>("tts")
  const [fishVoiceId, setFishVoiceId] = useState("default")
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9">("9:16")
  // 默认开启随机帧驱动：动作更自然（可按需关闭）
  const [naturalMotion, setNaturalMotion] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const aimGenerationIdRef = useRef<string | null>(null)
  const initRef = useRef(false)

  const { projects, defaultProjectId } = useStudioProjects(mounted)
  const avatarLibrary = useVideoAvatarLibrary(projectId, () => setAvatarSource("public"))
  const { publicPersons, loading: loadingPublic } = useStudioPublicPersons(mounted && avatarSource === "public")
  const { fishVoices } = useStudioFishVoices(mounted && voiceSource === "own_voice")
  const { task, setTask } = useStudioVideoTask()
  const { previewUrl, previewing, preview } = useScriptPreview(script, fishVoiceId)

  // 首次挂载：应用深链/交接/偏好的初始值（只执行一次；仓库惯例 warn 放行）
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!mounted || initRef.current) return
    initRef.current = true
    const init = resolveVideoWorkbenchInit(searchParams)
    setProjectId(init.projectId)
    if (init.script) {
      setScript(init.script)
      setStep(2)
    }
    if (init.voiceSource) setVoiceSource(init.voiceSource)
    setFishVoiceId(init.fishVoiceId)
    setAspectRatio(init.aspectRatio)
    aimGenerationIdRef.current = init.aimGenerationId
    if (init.clearHandoff) clearVideoHandoff()
  }, [mounted, searchParams])
  /* eslint-enable react-hooks/set-state-in-effect */

  // 项目未选中时兜底第一个项目
  useEffect(() => {
    if (!defaultProjectId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 默认选中兜底
    setProjectId((current) => current || defaultProjectId)
  }, [defaultProjectId])

  const publicVoiceId =
    selectedPublic?.defaultVoiceId
    ?? (publicPersons?.status === "ok" ? publicPersons.fallbackVoiceId : null)

  async function handleSubmit() {
    const error = validateVideoSubmission({
      script,
      avatarSource,
      selectedAvatarId: avatarLibrary.selectedAvatarId,
      selectedPublic,
      publicVoiceId,
      projectId,
    })
    if (error) {
      toast.error(error)
      return
    }
    setSubmitting(true)
    try {
      const created = await createVideoTask(
        buildCreateVideoTaskInput({
          projectId,
          avatarSource,
          selectedAvatarId: avatarLibrary.selectedAvatarId,
          selectedPublic,
          publicVoiceId,
          script: script.trim(),
          aspectRatio,
          voiceSource,
          fishVoiceId,
          aimGenerationId: aimGenerationIdRef.current,
          // 公共形象必须带形态：蝉镜对带形态列表的形象要求显式指定
          figureType: pickFigureType(selectedPublic?.figures, aspectRatio),
          driveMode: naturalMotion ? "random" : null,
        }),
      )
      saveVideoPrefs({ projectId, avatarId: avatarLibrary.selectedAvatarId, aspectRatio, fishVoiceId })
      setTask(created)
      toast.success("已提交生成，可离开页面，完成后在「作品」查看")
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "提交失败")
    } finally {
      setSubmitting(false)
    }
  }

  return {
    mounted,
    step,
    setStep,
    projects,
    projectId,
    setProjectId,
    avatarSource,
    setAvatarSource,
    avatarLibrary,
    publicPersons,
    loadingPublic,
    selectedPublic,
    setSelectedPublic,
    script,
    setScript,
    voiceSource,
    setVoiceSource,
    fishVoiceId,
    setFishVoiceId,
    fishVoices,
    aspectRatio,
    setAspectRatio,
    naturalMotion,
    setNaturalMotion,
    previewUrl,
    previewing,
    onPreview: preview,
    submitting,
    task,
    onSubmit: () => void handleSubmit(),
  }
}

function VideoWorkbenchSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

function VideoWorkbenchView({ vm }: { vm: VideoWorkbenchModel }) {
  if (!vm.mounted) return <VideoWorkbenchSkeleton />
  return (
    <div className="space-y-7">
      <div className="flex justify-center">
        <StepIndicator
          steps={VIDEO_STEPS}
          current={vm.step}
          onStepClick={(next) => next < vm.step && vm.setStep(next)}
        />
      </div>
      {vm.step === 1 ? <AvatarStepSection vm={vm} /> : null}
      {vm.step === 2 ? <ScriptStepSection vm={vm} /> : null}
      {vm.step === 3 ? <ReviewStepSection vm={vm} /> : null}
    </div>
  )
}

function AvatarStepSection({ vm }: { vm: VideoWorkbenchModel }) {
  return (
    <VideoAvatarStep
      projects={vm.projects}
      projectId={vm.projectId}
      onProjectChange={vm.setProjectId}
      avatarSource={vm.avatarSource}
      onSourceChange={vm.setAvatarSource}
      avatars={vm.avatarLibrary.avatars}
      loadingAvatars={vm.avatarLibrary.loading}
      avatarLoadError={vm.avatarLibrary.loadError}
      selectedAvatarId={vm.avatarLibrary.selectedAvatarId}
      onSelectAvatar={vm.avatarLibrary.setSelectedAvatarId}
      publicPersons={vm.publicPersons}
      loadingPublic={vm.loadingPublic}
      selectedPublic={vm.selectedPublic}
      onSelectPublic={vm.setSelectedPublic}
      onNext={() => vm.setStep(2)}
    />
  )
}

function ScriptStepSection({ vm }: { vm: VideoWorkbenchModel }) {
  const fishVoiceHint = vm.fishVoices.length === 0
    ? "暂无克隆音色，将使用平台默认音色；可到语音工坊克隆自己的声音。"
    : "提交时会先用所选音色合成音频，再驱动数字人对口型。"
  return (
    <VideoScriptStep
      script={vm.script}
      onScriptChange={vm.setScript}
      voiceSource={vm.voiceSource}
      onVoiceSourceChange={vm.setVoiceSource}
      fishVoices={vm.fishVoices}
      fishVoiceId={vm.fishVoiceId}
      onFishVoiceChange={vm.setFishVoiceId}
      fishVoiceFallbackHint={fishVoiceHint}
      onPreview={vm.onPreview}
      previewing={vm.previewing}
      previewUrl={vm.previewUrl}
      onBack={() => vm.setStep(1)}
      onNext={() => vm.setStep(3)}
    />
  )
}

function ReviewStepSection({ vm }: { vm: VideoWorkbenchModel }) {
  const avatarLabel = vm.avatarSource === "public"
    ? vm.selectedPublic?.name || "公共形象"
    : vm.avatarLibrary.avatars.find((item) => item.id === vm.avatarLibrary.selectedAvatarId)?.name || "我的形象"
  return (
    <VideoReviewStep
      avatarLabel={avatarLabel}
      voiceLabel={vm.voiceSource === "tts" ? "形象配套音色" : "我的克隆音色"}
      scriptPreview={vm.script.trim().slice(0, 60) || "（空文案）"}
      speechSeconds={Math.max(8, Math.round(vm.script.replace(/\s+/g, "").length / 4))}
      aspectRatio={vm.aspectRatio}
      onAspectRatioChange={(ratio) => vm.setAspectRatio(ratio)}
      naturalMotion={vm.naturalMotion}
      onNaturalMotionChange={vm.setNaturalMotion}
      submitting={vm.submitting}
      task={vm.task}
      onSubmit={vm.onSubmit}
      onBack={() => vm.setStep(2)}
    />
  )
}
