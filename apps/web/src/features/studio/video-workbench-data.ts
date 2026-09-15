"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { getVideoTask, listAvatars, listClientProjects } from "@/lib/api/client"
import { listPublicDigitalPersons, type PublicDigitalPersonList } from "@/lib/api/digital-human"
import { synthesizeVoiceAudio, type VoiceModelOption } from "@/lib/api/voice"
import type { ClientProject } from "@/lib/api/projects"
import type { ApiAvatar, ApiVideoTask } from "@/types/api"
import { loadVideoHandoff, loadVideoPrefs } from "@/lib/studio/studio-prefs"
import { loadMyVoices, type VideoVoiceSource } from "@/features/studio/video-script-step"

/** 深链交接来源：携带文案时这些 from 标记视为有效交接（消费后清除）。 */
const DEEP_LINK_SOURCES = new Set(["aim", "audio", "works"])

const TASK_POLL_MS = 4000
const ACTIVE_TASK_STATUS = ["pending", "queued", "processing"]

/** 视频工作台的数据装载：把副作用从组件拆出，保持每个函数 ≤80 行。 */

export interface VideoWorkbenchInit {
  script: string
  projectId: string
  voiceSource: VideoVoiceSource | null
  fishVoiceId: string
  aspectRatio: "9:16" | "16:9"
  startAtScript: boolean
  aimGenerationId: string | null
  clearHandoff: boolean
}

/** 深链参数 → sessionStorage 交接 → 上次偏好，决定初始值与起始步骤（纯函数，挂载时应用一次）。 */
export function resolveVideoWorkbenchInit(searchParams: URLSearchParams): VideoWorkbenchInit {
  const prefs = loadVideoPrefs()
  const from = searchParams.get("from")
  // 交接只在有效深链来源时消费：无 from 的直达访问不接收残留文案，保持全新开始
  const validDeepLink = Boolean(from && DEEP_LINK_SOURCES.has(from))
  const handoff = validDeepLink ? loadVideoHandoff() : null
  const script = searchParams.get("script") || handoff?.script || ""
  const voiceId = searchParams.get("voiceId") || handoff?.voiceId
  return {
    script,
    projectId: searchParams.get("projectId") || handoff?.projectId || prefs.projectId || "",
    voiceSource: voiceId ? "own_voice" : null,
    fishVoiceId: voiceId || prefs.fishVoiceId || "default",
    aspectRatio: prefs.aspectRatio ?? "9:16",
    startAtScript: Boolean(script),
    aimGenerationId: searchParams.get("aimGenerationId"),
    // 深链交接只消费一次；直达访问清掉可能残留的旧交接
    clearHandoff: !script || !validDeepLink,
  }
}

/** 项目列表；defaultProjectId 供父组件在未选中时兜底。 */
export function useStudioProjects(enabled: boolean): {
  projects: ClientProject[]
  defaultProjectId: string
} {
  const [projects, setProjects] = useState<ClientProject[]>([])
  useEffect(() => {
    if (!enabled) return
    void listClientProjects()
      .then(setProjects)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "项目列表加载失败")
      })
  }, [enabled])
  return { projects, defaultProjectId: projects[0]?.id ?? "" }
}

/** 形象列表跟随项目：自动选中上次/第一个可用形象；全无可用时回调引导公共形象。 */
export function useVideoAvatarLibrary(
  projectId: string,
  onNoReadyAvatar: () => void,
): {
  avatars: ApiAvatar[]
  loading: boolean
  loadError: string | null
  selectedAvatarId: string
  setSelectedAvatarId: (id: string) => void
} {
  const [avatars, setAvatars] = useState<ApiAvatar[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedAvatarId, setSelectedAvatarId] = useState("")

  useEffect(() => {
    if (!projectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 项目无效时清空
      setAvatars([])
      return
    }
    setLoading(true)
    setLoadError(null)
    let cancelled = false
    void listAvatars(projectId)
      .then((rows) => {
        if (cancelled) return
        setAvatars(rows)
        const ready = rows.filter((item) => item.status === "ready")
        if (ready.length === 0) {
          onNoReadyAvatar()
          return
        }
        const preferred = ready.find((item) => item.id === loadVideoPrefs().avatarId) ?? ready[0]
        setSelectedAvatarId(preferred.id)
      })
      .catch((error) => {
        if (cancelled) return
        // 记失败态：列表空可能只是加载失败，不能一律提示「还没有形象」
        setLoadError(error instanceof Error ? error.message : "形象列表加载失败")
        setAvatars([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 回调仅用于一次性引导公共形象
  }, [projectId])

  return { avatars, loading, loadError, selectedAvatarId, setSelectedAvatarId }
}

/** 公共形象懒加载：首次需要时拉取一次。 */
export function useStudioPublicPersons(enabled: boolean): {
  publicPersons: PublicDigitalPersonList | null
  loading: boolean
} {
  const [publicPersons, setPublicPersons] = useState<PublicDigitalPersonList | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || publicPersons) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入加载态
    setLoading(true)
    void listPublicDigitalPersons()
      .then(setPublicPersons)
      .catch((error: unknown) =>
        setPublicPersons({
          status: "error",
          message: error instanceof Error ? error.message : "读取公共数字人失败",
        }),
      )
      .finally(() => setLoading(false))
  }, [enabled, publicPersons])

  return { publicPersons, loading }
}

/** 我的克隆音色懒加载。 */
export function useStudioFishVoices(enabled: boolean): {
  fishVoices: VoiceModelOption[]
  loading: boolean
} {
  const [fishVoices, setFishVoices] = useState<VoiceModelOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 进入加载态
    setLoading(true)
    void loadMyVoices()
      .then(setFishVoices)
      .finally(() => setLoading(false))
  }, [enabled])

  return { fishVoices, loading }
}

/** 成片任务状态 + 轮询：提交后页面可停留也可离开。 */
export function useStudioVideoTask(): {
  task: ApiVideoTask | null
  setTask: (task: ApiVideoTask) => void
} {
  const [task, setTask] = useState<ApiVideoTask | null>(null)

  useEffect(() => {
    if (!task || !ACTIVE_TASK_STATUS.includes(task.status)) return
    const timer = window.setInterval(() => {
      void getVideoTask(task.id)
        .then(setTask)
        .catch(() => {
          /* 轮询失败继续等下一次；终态由任务本身给出 */
        })
    }, TASK_POLL_MS)
    return () => window.clearInterval(timer)
  }, [task])

  return { task, setTask }
}

/** 音频预演：先用普通 TTS 试听口播效果，满意再渲染成片。 */
export function useScriptPreview(script: string, fishVoiceId: string): {
  previewUrl: string | null
  previewing: boolean
  preview: () => void
} {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)

  const preview = () => {
    if (previewing) return
    setPreviewing(true)
    setPreviewUrl(null)
    void synthesizeVoiceAudio({
      text: script.replace(/\s+/g, " ").slice(0, 200),
      voiceId: fishVoiceId === "default" ? null : fishVoiceId,
      model: null,
      speed: 1,
    })
      .then((result) => setPreviewUrl(result.objectUrl))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "预演失败"))
      .finally(() => setPreviewing(false))
  }

  return { previewUrl, previewing, preview }
}

/** 提交前校验：返回一句人话错误，null 表示可提交。 */
export function validateVideoSubmission(input: {
  script: string
  avatarSource: "mine" | "public"
  selectedAvatarId: string
  selectedPublic: { id: string } | null
  publicVoiceId: string | null
  projectId: string
}): string | null {
  if (!input.script.trim()) return "请先确认口播文案"
  if (input.avatarSource === "public") {
    if (!input.selectedPublic) return "请选择一个公共数字人"
    if (!input.publicVoiceId) return "该形象暂无可用音色，请稍后重试或换一个形象"
  } else if (!input.selectedAvatarId) {
    return "请选择一个可用数字人"
  }
  if (!input.projectId) return "请先选择一个客户项目"
  return null
}

/**
 * 从形象的形态列表中挑一个与目标画面比例匹配的 figure_type。
 *
 * 蝉镜对带形态列表的形象（公共形象全部如此）要求显式指定形态，缺失会以
 * 50000 拒绝下单；且各形象形态不同（如样本形象只有 sit_body / circle_view，
 * 没有 whole_body），因此必须按实际列表选，不能硬编码默认值。
 */
export function pickFigureType(
  figures: Array<{ type: string; width: number; height: number }> | undefined,
  aspectRatio: "9:16" | "16:9",
): string | null {
  if (!figures || figures.length === 0) return null
  const [targetWidth, targetHeight] = aspectRatio === "16:9" ? [1920, 1080] : [1080, 1920]
  const exact = figures.find((f) => f.width === targetWidth && f.height === targetHeight)
  if (exact) return exact.type
  const whole = figures.find((f) => f.type === "whole_body")
  if (whole) return whole.type
  return figures[0]?.type ?? null
}

/** 组装 createVideoTask 的入参（与 AIM 出片弹窗契约一致）。 */
export function buildCreateVideoTaskInput(input: {
  projectId: string
  avatarSource: "mine" | "public"
  selectedAvatarId: string
  selectedPublic: { id: string; name: string } | null
  publicVoiceId: string | null
  script: string
  aspectRatio: "9:16" | "16:9"
  voiceSource: VideoVoiceSource
  fishVoiceId: string
  aimGenerationId: string | null
  /** 公共形象的形态（从该形象的 figures 中按画面比例选出） */
  figureType?: string | null
}) {
  return {
    type: "virtualman_broadcast",
    projectId: input.projectId,
    aimGenerationId: input.aimGenerationId ?? undefined,
    // 公共数字人直接带供应商的形象与音色 id；自建数字人走 avatarId
    ...(input.avatarSource === "public"
      ? {
          virtualmanId: input.selectedPublic?.id,
          speakerId: input.publicVoiceId,
          avatarName: input.selectedPublic?.name ?? "",
          ...(input.figureType ? { figureType: input.figureType } : {}),
        }
      : { avatarId: input.selectedAvatarId }),
    scriptContent: input.script,
    aspectRatio: input.aspectRatio,
    ...(input.voiceSource === "own_voice"
      ? { voiceSource: input.voiceSource, voiceId: input.fishVoiceId === "default" ? undefined : input.fishVoiceId }
      : {}),
  }
}
