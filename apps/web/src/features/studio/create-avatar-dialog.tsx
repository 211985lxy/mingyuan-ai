"use client"

import { useCallback, useState } from "react"
import { Loader2, Plus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  createAvatar,
  getAuthVideoRequirements,
  saveAuthVideo,
  uploadFileToStorage,
} from "@/lib/api/client"

/**
 * 极速克隆数字人：授权视频 + 本人素材（原资产库 avatars-tab 迁入工坊素材库）。
 * 授权合规确认步骤完整保留，不作简化。
 */
export function CreateAvatarDialog({
  projectId,
  disabled = false,
  onCreated,
}: {
  projectId: string
  disabled?: boolean
  onCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<AvatarFormState>(emptyForm)
  const [requirements, setRequirements] = useState<AuthRequirements>({ status: "idle" })
  const [submitting, setSubmitting] = useState(false)

  const reset = useCallback(() => {
    setForm(emptyForm())
    setRequirements({ status: "idle" })
    setSubmitting(false)
  }, [])

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) void loadRequirements(setRequirements)
    else reset()
  }

  function patchForm(patch: Partial<AvatarFormState>) {
    setForm((current) => ({ ...current, ...patch }))
  }

  async function handleSubmit() {
    const authText = requirements.status === "ready" ? requirements.authorizationText : ""
    const error = validateAvatarForm(form, authText)
    if (error) {
      toast.error(error)
      return
    }
    setSubmitting(true)
    try {
      await submitAvatarClone({ form: form, projectId, authText })
      toast.success("已提交克隆，通常几分钟后可用")
      setOpen(false)
      reset()
      onCreated()
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "创建失败")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={disabled}>
          <Plus className="mr-1 h-4 w-4" />
          克隆数字人
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>极速克隆数字人</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="studio-avatar-name">名称</Label>
            <Input
              id="studio-avatar-name"
              value={form.name}
              onChange={(e) => patchForm({ name: e.target.value })}
              placeholder="例如：老板本人"
            />
          </div>
          <AuthorizationBlock
            requirements={requirements}
            confirmed={form.authConfirmed}
            onConfirmedChange={(checked) => patchForm({ authConfirmed: checked })}
            onFileChange={(file) => patchForm({ authFile: file })}
            submitting={submitting}
          />
          <div className="space-y-2">
            <Label htmlFor="studio-source-video">克隆素材视频</Label>
            <Input
              id="studio-source-video"
              type="file"
              accept="video/*"
              onChange={(e) => patchForm({ sourceFile: e.target.files?.[0] ?? null })}
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

interface AvatarFormState {
  name: string
  authFile: File | null
  sourceFile: File | null
  authConfirmed: boolean
}

type AuthRequirements =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; provider: "chanjing" | "shanjian" | "heygen"; authorizationText: string }
  | { status: "error"; message: string }

function emptyForm(): AvatarFormState {
  return { name: "", authFile: null, sourceFile: null, authConfirmed: false }
}

async function loadRequirements(set: (next: AuthRequirements) => void) {
  set({ status: "loading" })
  try {
    const data = await getAuthVideoRequirements()
    set({ status: "ready", provider: data.provider, authorizationText: data.authorizationText })
  } catch (error) {
    const code = (error as { code?: string })?.code
    const status = (error as { status?: number })?.status
    toast.error(error instanceof Error ? error.message : "授权文案加载失败")
    let message = "授权文案暂不可用，请联系管理员配置后重试。"
    if (code === "AUTH_NAME_REQUIRED") {
      message = "请先在「账号设置」完善真实姓名：授权声明需以本人姓名逐字朗读。"
    } else if (status === 401 || status === 403) {
      message = "登录状态已失效或账号未激活，请重新登录后再试。"
    }
    set({ status: "error", message })
  }
}

function validateAvatarForm(form: AvatarFormState, authText: string): string | null {
  if (!form.name.trim()) return "请填写数字人名称"
  if (!form.authFile) return "请先上传授权视频"
  if (!form.sourceFile) return "请上传用于克隆的本人视频"
  if (!authText || !form.authConfirmed) return "请先阅读并确认按原文录制授权视频"
  return null
}

/** 上传授权视频（登记）→ 按服务端原文确认保存 → 上传克隆素材 → 创建克隆任务。 */
async function submitAvatarClone(input: {
  form: AvatarFormState
  projectId: string
  authText: string
}) {
  const authUpload = await uploadFileToStorage(input.form.authFile!, {
    assetType: "video",
    register: true,
  })
  await saveAuthVideo(authUpload.assetUrl, {
    uploadId: authUpload.uploadId,
    authText: input.authText,
  })
  const sourceUpload = await uploadFileToStorage(input.form.sourceFile!, {
    assetType: "video",
    register: false,
  })
  await createAvatar({
    name: input.form.name.trim(),
    projectId: input.projectId,
    cloneType: "fast",
    videoUrl: sourceUpload.assetUrl,
  })
}

/** 授权视频上传 + 服务端授权原文展示 + 本人确认勾选（合规步骤，完整保留）。 */
function AuthorizationBlock({
  requirements,
  confirmed,
  onConfirmedChange,
  onFileChange,
  submitting,
}: {
  requirements: AuthRequirements
  confirmed: boolean
  onConfirmedChange: (checked: boolean) => void
  onFileChange: (file: File | null) => void
  submitting: boolean
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="studio-auth-video">授权视频</Label>
      <Input
        id="studio-auth-video"
        type="file"
        accept="video/*"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
      />
      <AuthorizationTextBlock
        requirements={requirements}
        confirmed={confirmed}
        onConfirmedChange={onConfirmedChange}
        submitting={submitting}
      />
    </div>
  )
}

function AuthorizationTextBlock({
  requirements,
  confirmed,
  onConfirmedChange,
  submitting,
}: {
  requirements: AuthRequirements
  confirmed: boolean
  onConfirmedChange: (checked: boolean) => void
  submitting: boolean
}) {
  if (requirements.status === "loading") {
    return <p className="text-xs text-muted-foreground">正在加载授权文案…</p>
  }
  if (requirements.status !== "ready") {
    return (
      <p className="text-xs text-destructive">
        {requirements.status === "error" ? requirements.message : "授权文案暂不可用，请联系管理员配置后重试。"}
      </p>
    )
  }
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-xs leading-5">
      <p className="mb-1 font-medium">{requirements.provider === "chanjing" ? "蝉镜" : "闪剪"}授权原文（请逐字朗读）</p>
      <p className="whitespace-pre-wrap">{requirements.authorizationText}</p>
      <label className="mt-3 flex items-start gap-2">
        <Checkbox
          checked={confirmed}
          onCheckedChange={(checked) => onConfirmedChange(checked === true)}
          disabled={submitting}
        />
        <span>我已按以上原文录制授权视频，并确认本人同意用于数字人制作。</span>
      </label>
    </div>
  )
}
