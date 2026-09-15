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
import {
  findAuthorizationNamePlaceholder,
  splitAuthorizationTextByPlaceholder,
} from "@/lib/studio/authorization-text"
import { CameraRecorder } from "@/features/studio/camera-recorder"

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
          <CameraRecorder
            label="授权视频"
            filePrefix="digital-human-authorization"
            value={form.authFile}
            onChange={(file) => patchForm({ authFile: file })}
            hint="对准本人，逐字朗读下方授权原文（姓名处念您的真实姓名）。"
          />
          <AuthorizationBlock
            requirements={requirements}
            confirmed={form.authConfirmed}
            onConfirmedChange={(checked) => patchForm({ authConfirmed: checked })}
            submitting={submitting}
          />
          <CameraRecorder
            label="克隆素材视频"
            filePrefix="digital-human-source"
            value={form.sourceFile}
            onChange={(file) => patchForm({ sourceFile: file })}
            hint="正面口播 10–60 秒：光线充足、人像居中、正常语速说话，效果最佳。"
          />
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

/** 授权原文展示 + 本人确认勾选（合规步骤，完整保留）。 */
function AuthorizationBlock({
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
  return (
    <AuthorizationTextBlock
      requirements={requirements}
      confirmed={confirmed}
      onConfirmedChange={onConfirmedChange}
      submitting={submitting}
    />
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
  const placeholder = findAuthorizationNamePlaceholder(requirements.authorizationText)
  return (
    <div className="rounded-md border bg-muted/40 p-3 text-xs leading-5">
      <p className="mb-1 font-medium">{requirements.provider === "chanjing" ? "蝉镜" : "闪剪"}授权原文（请逐字朗读）</p>
      {placeholder ? <NamePlaceholderHint placeholder={placeholder} /> : null}
      <AuthorizationTextPreview text={requirements.authorizationText} />
      <p className="mt-2 text-muted-foreground">
        录制时请把{placeholder ? "姓名清晰朗读为" : "全文（含您的姓名）"}逐字念出，与「账号设置」中登记的真实姓名保持一致。
      </p>
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

/** 姓名占位提示：明确告知「xxx」处要朗读本人真实姓名。 */
function NamePlaceholderHint({ placeholder }: { placeholder: string }) {
  return (
    <p className="mb-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-800 dark:text-amber-200">
      提示：原文中的「{placeholder}」是姓名占位——录制授权视频时，请把它朗读成
      <strong>您本人的真实姓名</strong>（需与「账号设置」中登记的姓名一致）。
    </p>
  )
}

/** 原文渲染：姓名占位符高亮显示。 */
function AuthorizationTextPreview({ text }: { text: string }) {
  const segments = splitAuthorizationTextByPlaceholder(text)
  return (
    <p className="whitespace-pre-wrap">
      {segments.map((segment, index) =>
        segment.type === "name" ? (
          <mark
            key={index}
            className="rounded bg-amber-300/60 px-0.5 font-semibold text-amber-900 dark:bg-amber-400/30 dark:text-amber-100"
          >
            {segment.value}
          </mark>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </p>
  )
}
