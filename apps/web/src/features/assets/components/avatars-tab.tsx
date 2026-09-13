"use client"

import { useCallback, useState } from "react"
import { Loader2, Plus, RotateCcw, User } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createAvatar,
  getAuthVideoRequirements,
  retryAvatar,
  saveAuthVideo,
  uploadFileToStorage,
} from "@/lib/api/client"
import type { ClientProject } from "@/lib/api/projects"
import type { ApiAvatar } from "@/types/api"

const STATUS_LABEL: Record<string, string> = {
  uploading: "上传中",
  reviewing: "审核中",
  queued: "排队中",
  cloning: "克隆中",
  ready: "可用",
  failed: "失败",
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default"
  if (status === "failed") return "destructive"
  if (status === "cloning" || status === "uploading" || status === "reviewing" || status === "queued") return "secondary"
  return "outline"
}

export function AvatarsTab({
  avatars,
  loading,
  projects,
  projectId,
  onProjectChange,
  onRefresh,
}: {
  avatars: ApiAvatar[]
  loading: boolean
  projects: ClientProject[]
  projectId: string
  onProjectChange: (projectId: string) => void
  onRefresh: () => void
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-6">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-5 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            先录一段授权视频，再上传本人素材做极速克隆。就绪后可在作品编辑里一键出片。
          </p>
          {projects.length > 0 ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="avatar-project" className="text-xs text-muted-foreground">当前项目</Label>
              <Select value={projectId || undefined} onValueChange={(value) => value && onProjectChange(value)}>
                <SelectTrigger id="avatar-project" className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder="选择客户项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
        <CreateAvatarDialog projectId={projectId} disabled={!projectId} onCreated={onRefresh} />
      </div>

      {!projectId ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">请先创建一个客户项目，再创建项目专属数字人。</p>
          </CardContent>
        </Card>
      ) : avatars.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <User className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">还没有数字人，先创建一个。</p>
            <CreateAvatarDialog projectId={projectId} onCreated={onRefresh} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {avatars.map((avatar) => (
            <AvatarCard key={avatar.id} avatar={avatar} onRefresh={onRefresh} />
          ))}
        </div>
      )}
    </section>
  )
}

function AvatarCard({
  avatar,
  onRefresh,
}: {
  avatar: ApiAvatar
  onRefresh: () => void
}) {
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
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={avatar.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <User className="h-10 w-10" />
          </div>
        )}
      </div>
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{avatar.name}</p>
            {avatar.speakerName ? (
              <p className="text-xs text-muted-foreground">声音：{avatar.speakerName}</p>
            ) : null}
          </div>
          <Badge variant={statusVariant(avatar.status)}>
            {STATUS_LABEL[avatar.status] ?? avatar.status}
          </Badge>
        </div>
        {avatar.status === "failed" ? (
          <div className="space-y-2">
            <p className="text-xs text-destructive">
              {avatar.errorMessage || "克隆失败，可重试"}
            </p>
            <Button size="sm" variant="outline" disabled={retrying} onClick={() => void handleRetry()}>
              {retrying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
              重试
            </Button>
          </div>
        ) : null}
        {avatar.demoVideoUrl && avatar.status === "ready" ? (
          <a
            href={avatar.demoVideoUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-primary underline-offset-2 hover:underline"
          >
            预览样片
          </a>
        ) : null}
      </CardContent>
    </Card>
  )
}

function CreateAvatarDialog({
  projectId,
  disabled = false,
  onCreated,
}: {
  projectId: string
  disabled?: boolean
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [authFile, setAuthFile] = useState<File | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [authorizationText, setAuthorizationText] = useState("")
  const [provider, setProvider] = useState<"chanjing" | "shanjian" | "heygen">("chanjing")
  const [authConfirmed, setAuthConfirmed] = useState(false)
  const [requirementsLoading, setRequirementsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const reset = useCallback(() => {
    setName("")
    setAuthFile(null)
    setSourceFile(null)
    setAuthorizationText("")
    setAuthConfirmed(false)
    setRequirementsLoading(false)
    setSubmitting(false)
  }, [])

  async function loadAuthorizationRequirements() {
    setRequirementsLoading(true)
    try {
      const requirements = await getAuthVideoRequirements()
      setProvider(requirements.provider)
      setAuthorizationText(requirements.authorizationText)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "授权文案加载失败")
      setAuthorizationText("")
    } finally {
      setRequirementsLoading(false)
    }
  }

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("请填写数字人名称")
      return
    }
    if (!authFile) {
      toast.error("请先上传授权视频")
      return
    }
    if (!sourceFile) {
      toast.error("请上传用于克隆的本人视频")
      return
    }
    if (!authorizationText || !authConfirmed) {
      toast.error("请先阅读并确认按原文录制授权视频")
      return
    }

    setSubmitting(true)
    try {
      const authUpload = await uploadFileToStorage(authFile, {
        assetType: "video",
        register: true,
      })
      await saveAuthVideo(authUpload.assetUrl, {
        uploadId: authUpload.uploadId,
        authText: authorizationText,
      })

      const sourceUpload = await uploadFileToStorage(sourceFile, {
        assetType: "video",
        register: false,
      })

      await createAvatar({
        name: name.trim(),
        projectId,
        cloneType: "fast",
        videoUrl: sourceUpload.assetUrl,
      })

      toast.success("已提交克隆，通常几分钟后可用")
      setOpen(false)
      reset()
      onCreated()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
      <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void loadAuthorizationRequirements()
        else reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          <Plus className="mr-1 h-4 w-4" />
          创建数字人
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>极速克隆数字人</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="avatar-name">名称</Label>
            <Input
              id="avatar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：老板本人"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="auth-video">授权视频</Label>
            <Input
              id="auth-video"
              type="file"
              accept="video/*"
              onChange={(e) => setAuthFile(e.target.files?.[0] ?? null)}
            />
            {requirementsLoading ? (
              <p className="text-xs text-muted-foreground">正在加载授权文案…</p>
            ) : authorizationText ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs leading-5">
                <p className="mb-1 font-medium">{provider === "chanjing" ? "蝉镜" : "闪剪"}授权原文（请逐字朗读）</p>
                <p className="whitespace-pre-wrap">{authorizationText}</p>
                <label className="mt-3 flex items-start gap-2">
                  <Checkbox
                    checked={authConfirmed}
                    onCheckedChange={(checked) => setAuthConfirmed(checked === true)}
                    disabled={submitting}
                  />
                  <span>我已按以上原文录制授权视频，并确认本人同意用于数字人制作。</span>
                </label>
              </div>
            ) : (
              <p className="text-xs text-destructive">授权文案暂不可用，请联系管理员配置后重试。</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-video">克隆素材视频</Label>
            <Input
              id="source-video"
              type="file"
              accept="video/*"
              onChange={(e) => setSourceFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-xs text-muted-foreground">上传本人正面口播素材，用于生成数字人。</p>
          </div>
          <Button className="w-full" disabled={submitting} onClick={() => void handleSubmit()}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            提交克隆
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
