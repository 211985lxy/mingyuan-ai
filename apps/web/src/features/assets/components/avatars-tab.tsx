"use client"

import { useCallback, useEffect, useState } from "react"
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
import {
  createAvatar,
  retryAvatar,
  saveAuthVideo,
  uploadFileToStorage,
} from "@/lib/api/client"
import type { ApiAvatar } from "@/types/api"

const STATUS_LABEL: Record<string, string> = {
  uploading: "上传中",
  cloning: "克隆中",
  ready: "可用",
  failed: "失败",
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ready") return "default"
  if (status === "failed") return "destructive"
  if (status === "cloning" || status === "uploading") return "secondary"
  return "outline"
}

export function AvatarsTab({
  avatars,
  loading,
  onRefresh,
}: {
  avatars: ApiAvatar[]
  loading: boolean
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
        <p className="text-sm text-muted-foreground">
          先录一段授权视频，再上传本人素材做极速克隆。就绪后可在作品编辑里一键出片。
        </p>
        <CreateAvatarDialog onCreated={onRefresh} />
      </div>

      {avatars.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <User className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">还没有数字人，先创建一个。</p>
            <CreateAvatarDialog onCreated={onRefresh} />
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

function CreateAvatarDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [authFile, setAuthFile] = useState<File | null>(null)
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const reset = useCallback(() => {
    setName("")
    setAuthFile(null)
    setSourceFile(null)
    setSubmitting(false)
  }, [])

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

    setSubmitting(true)
    try {
      const authUpload = await uploadFileToStorage(authFile, {
        assetType: "video",
        register: false,
      })
      await saveAuthVideo(authUpload.assetUrl)

      const sourceUpload = await uploadFileToStorage(sourceFile, {
        assetType: "video",
        register: false,
      })

      await createAvatar({
        name: name.trim(),
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
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
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
            <p className="text-xs text-muted-foreground">
              录一次即可复用。需按产品要求念出授权文案。
            </p>
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
