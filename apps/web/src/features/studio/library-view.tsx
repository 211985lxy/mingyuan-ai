"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RotateCcw, User } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { VoiceServiceNotice } from "@/components/voice/voice-service-notice"
import { VoiceCloneButton } from "@/components/voice/voice-clone-dialog"
import { useVoiceSamplePreview, VoicePickerList } from "@/components/voice/voice-sample-preview"
import { listAvatars, retryAvatar } from "@/lib/api/client"
import { useVoiceModels } from "@/features/studio/audio-voice-step"
import { CreateAvatarDialog } from "@/features/studio/create-avatar-dialog"
import { ProjectPickerRow } from "@/features/studio/video-avatar-step"
import { useStudioPublicPersons } from "@/features/studio/video-workbench-data"
import { useStudioProjects } from "@/features/studio/video-workbench-data"
import type { ApiAvatar } from "@/types/api"

const AVATAR_STATUS_LABEL: Record<string, string> = {
  uploading: "上传中",
  reviewing: "审核中",
  queued: "排队中",
  cloning: "克隆中",
  ready: "可用",
  failed: "失败",
}

/** 素材库：工坊内管理「可用的声音与形象」。公共资源只读。 */
export function StudioLibraryView() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">素材库</h1>
        <p className="text-sm text-muted-foreground">
          我的音色与形象在这里管理；原始素材文件仍在资产库。
        </p>
      </header>
      <Tabs defaultValue="voices" className="space-y-5">
        <TabsList>
          <TabsTrigger value="voices">我的音色</TabsTrigger>
          <TabsTrigger value="avatars">我的形象</TabsTrigger>
          <TabsTrigger value="public">公共形象</TabsTrigger>
        </TabsList>
        <TabsContent value="voices">
          <MyVoicesPanel />
        </TabsContent>
        <TabsContent value="avatars">
          <MyAvatarsPanel />
        </TabsContent>
        <TabsContent value="public">
          <PublicPersonsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** 我的音色：试听 + 克隆入口。 */
function MyVoicesPanel() {
  const [scope, setScope] = useState<"all" | "mine">("mine")
  const { models, loadingModels, modelsError, reloadModels } = useVoiceModels(scope)
  const preview = useVoiceSamplePreview(models?.defaultModel ?? null, 1)

  if (models && models.configured === false) {
    return <VoiceServiceNotice kind="unconfigured" message={models.reason ?? null} onRetry={() => void reloadModels()} />
  }
  if (modelsError) {
    return <VoiceServiceNotice kind="error" message={modelsError} onRetry={() => void reloadModels()} />
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Button
            type="button"
            variant={scope === "mine" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setScope("mine")}
          >
            我的音色
          </Button>
          <Button
            type="button"
            variant={scope === "all" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setScope("all")}
          >
            公共音色
          </Button>
        </div>
        <VoiceCloneButton onCloned={() => void reloadModels()} />
      </div>
      {loadingModels && !models ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <VoicePickerList
          options={models?.voices ?? []}
          voiceId=""
          onVoicePick={() => {
            /* 素材库只做试听管理；选用在音频/视频工作台完成 */
          }}
          preview={preview}
          disabled={loadingModels || models?.configured === false}
        />
      )}
    </section>
  )
}

/** 我的形象：项目维度管理克隆状态，失败可重试。 */
function MyAvatarsPanel() {
  const { projects, defaultProjectId } = useStudioProjects(true)
  const [projectId, setProjectId] = useState("")
  useEffect(() => {
    if (!defaultProjectId) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 默认选中兜底
    setProjectId((current) => current || defaultProjectId)
  }, [defaultProjectId])
  const { avatars, loading, refresh } = useAvatarLibraryList(projectId)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ProjectPickerRow projects={projects} projectId={projectId} onProjectChange={setProjectId} />
        <CreateAvatarDialog projectId={projectId} disabled={!projectId} onCreated={refresh} />
      </div>
      {projects.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            先到「我的项目」创建客户项目，再克隆项目专属数字人。
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-3 pt-6">
                <Skeleton className="aspect-video w-full" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : avatars.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <User className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">这个项目还没有数字人，点右上角「克隆数字人」创建。</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {avatars.map((avatar) => (
            <AvatarLibraryCard key={avatar.id} avatar={avatar} onRefresh={refresh} />
          ))}
        </div>
      )}
    </section>
  )
}

function useAvatarLibraryList(projectId: string): {
  avatars: ApiAvatar[]
  loading: boolean
  refresh: () => void
} {
  const [avatars, setAvatars] = useState<ApiAvatar[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

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
        if (!cancelled) setAvatars(rows)
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
  }, [projectId, refreshKey])

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), [])
  return { avatars, loading, refresh }
}

function AvatarLibraryCard({ avatar, onRefresh }: { avatar: ApiAvatar; onRefresh: () => void }) {
  const [retrying, setRetrying] = useState(false)
  const cover = avatar.thumbnailUrl || avatar.coverUrl || avatar.previewUrl

  async function handleRetry() {
    setRetrying(true)
    try {
      await retryAvatar(avatar.id)
      toast.success("已重新提交克隆")
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重试失败")
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- 供应商返回的直链缩略图
          <img src={cover} alt={avatar.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <User className="h-10 w-10" />
          </div>
        )}
      </div>
      <CardContent className="space-y-2 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{avatar.name}</p>
            {avatar.speakerName ? (
              <p className="text-xs text-muted-foreground">声音：{avatar.speakerName}</p>
            ) : null}
          </div>
          <Badge variant={avatar.status === "failed" ? "destructive" : "secondary"}>
            {AVATAR_STATUS_LABEL[avatar.status] ?? avatar.status}
          </Badge>
        </div>
        {avatar.status === "failed" ? (
          <div className="space-y-1.5">
            <p className="text-xs text-destructive">{avatar.errorMessage || "克隆失败，可重试"}</p>
            <Button size="sm" variant="outline" disabled={retrying} onClick={() => void handleRetry()}>
              {retrying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
              重试
            </Button>
          </div>
        ) : null}
        {avatar.demoVideoUrl && avatar.status === "ready" ? (
          <a href={avatar.demoVideoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
            预览样片
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}

/** 公共形象：只读展示，选用在视频工作台完成。 */
function PublicPersonsPanel() {
  const { publicPersons, loading } = useStudioPublicPersons(true)

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        加载公共形象…
      </p>
    )
  }
  if (!publicPersons || publicPersons.status !== "ok") {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {publicPersons && "message" in publicPersons
            ? publicPersons.message
            : "公共形象列表暂不可用，请稍后再试。"}
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {publicPersons.persons.map((person) => (
        <Card key={person.id}>
          <CardContent className="space-y-1.5 py-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-medium">{person.name}</p>
              {person.gender ? <Badge variant="outline">{person.gender}</Badge> : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {person.voiceName ? `配套音色：${person.voiceName}` : "无需克隆，可在视频工作台直接出片"}
            </p>
          </CardContent>
        </Card>
      ))}
      <p className="col-span-full text-xs text-muted-foreground">
        公共形象仅供出片选用；如需专属形象，切到「我的形象」克隆。
      </p>
    </div>
  )
}
