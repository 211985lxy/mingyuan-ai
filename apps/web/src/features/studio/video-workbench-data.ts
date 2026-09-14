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
  const handoff = loadVideoHandoff()
  const script = searchParams.get("script") || handoff?.script || ""
  const voiceId = searchParams.get("voiceId") || handoff?.voiceId
  const from = searchParams.get("from")
  return {
    script,
    projectId: searchParams.get("projectId") || handoff?.projectId || prefs.projectId || "",
    voiceSource: voiceId ? "own_voice" : null,
    fishVoiceId: voiceId || prefs.fishVoiceId || "default",
    aspectRatio: prefs.aspectRatio ?? "9:16",
    startAtScript: Boolean(script),
    aimGenerationId: searchParams.get("aimGenerationId"),
    // 深链交接只消费一次；无 from 标记的直达访问清掉可能残留的旧交接
    clearHandoff: !script || (from !== "aim" && from !== "audio"),
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
  selectedAvatarId: string
  setSelectedAvatarId: (id: string) => void
} {
  const [avatars, setAvatars] = useState<ApiAvatar[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedAvatarId, setSelectedAvatarId] = useState("")

  useEffect(() => {
    if (!projectId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 项目无效时清空
      setAvatars([])
      return
    }
    setLoading(true)
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
        toast.error(error instanceof Error ? error.message : "数字人列表加载失败")
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

  return { avatars, loading, selectedAvatarId, setSelectedAvatarId }
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
        }
      : { avatarId: input.selectedAvatarId }),
    scriptContent: input.script,
    aspectRatio: input.aspectRatio,
    ...(input.voiceSource === "own_voice"
      ? { voiceSource: input.voiceSource, voiceId: input.fishVoiceId === "default" ? undefined : input.fishVoiceId }
      : {}),
  }
}
