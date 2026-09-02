"use client"

import { useCallback, useEffect, useState } from "react"
import { FileUser, Loader2, Save } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  buildProfilePages,
  computeProfileCompleteness,
  IP_PROFILE_FIELDS,
  IP_PROFILE_PAGE_LABELS,
  IP_PROFILE_PAGE_ORDER,
  parseProfileFromPages,
  type IpProfileForm,
} from "@/lib/aim/ip-profile-form"

type IpWikiPageType = import("@/lib/ip-wiki/types").IpWikiPageType

export interface AimIpProfileDialogProps {
  open: boolean
  projectId: string | null
  onOpenChange: (open: boolean) => void
}

/** 创作台入口条：让"档案"看得见、点得开 */
export function AimIpProfileEntryBar({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="flex items-center px-3 py-1 sm:px-5">
      <button
        type="button"
        onClick={onOpen}
        className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
      >
        IP 档案 · 填一次，生成时整块带上（我是谁 / 卖什么 / 服务谁）
      </button>
    </div>
  )
}

function CompletenessBanner({ hints }: { hints: string[] }) {
  if (hints.length === 0) {
    return (
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300">
        七栏齐全。生成时说「结合项目资料」即可带上这份档案。
      </div>
    )
  }
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="font-medium">还缺 {hints.length} 栏：</span>
      {hints.slice(0, 3).join("；")}
      {hints.length > 3 ? " 等" : ""}
      <span className="ml-1 opacity-80">（不填也能生成，填了更准）</span>
    </div>
  )
}

function ProfilePageSection({
  pageType,
  form,
  setForm,
}: {
  pageType: (typeof IP_PROFILE_PAGE_ORDER)[number]
  form: IpProfileForm
  setForm: React.Dispatch<React.SetStateAction<IpProfileForm>>
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{IP_PROFILE_PAGE_LABELS[pageType]}</p>
      {IP_PROFILE_FIELDS.filter((field) => field.pageType === pageType).map((field) => (
        <label key={field.key} className="block space-y-1">
          <span className="text-sm font-medium">{field.label}</span>
          <Textarea
            value={form[field.key] ?? ""}
            placeholder={field.placeholder}
            rows={field.key === "persona" ? 3 : 2}
            className={cn("text-sm", !(form[field.key] ?? "").trim() && "border-dashed")}
            onChange={(event) => setForm((prev) => ({ ...prev, [field.key]: event.target.value }))}
          />
        </label>
      ))}
    </div>
  )
}

/**
 * IP 档案：七栏表单（我是谁/卖什么/服务谁/客户最痛/核心卖点/内容目标/独特人设）。
 * 填一次，生成时整块进入上下文（IP Wiki AOT 定位底盘）——模型不用猜，也不用向量检索。
 * 表单即编辑器：打开时回填现有 active 页，保存复用 /api/aim/ip-wiki/pages（归档+版本递增）。
 */
/** 档案读写状态：加载回填 + 保存到 /api/aim/ip-wiki/pages */
function useIpProfileState(projectId: string | null, open: boolean, onSaved: () => void) {
  const [form, setForm] = useState<IpProfileForm>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [hasPages, setHasPages] = useState(false)
  const [savedPages, setSavedPages] = useState<Array<{ pageType: IpWikiPageType; content: string }>>([])

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/aim/ip-wiki/pages?projectId=${encodeURIComponent(projectId)}`)
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "档案读取失败")
      const pages: Array<{ pageType: IpWikiPageType; content: string }> = Array.isArray(body.pages) ? body.pages : []
      setForm(parseProfileFromPages(pages))
      setHasPages(pages.length > 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "档案读取失败")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  useEffect(() => {
    setSavedPages(buildProfilePages(form))
  }, [form])

  const save = useCallback(async () => {
    if (!projectId || savedPages.length === 0) {
      if (savedPages.length === 0) toast.message("至少填一栏再保存")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/aim/ip-wiki/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, pages: savedPages }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "档案保存失败")
      toast.success(`IP 档案已保存（${savedPages.length} 页）`, { description: "之后生成时说「结合项目资料」即可整块带上档案。" })
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "档案保存失败")
    } finally {
      setSaving(false)
    }
  }, [projectId, savedPages, onSaved])

  return { form, setForm, loading, saving, hasPages, savedPages, save }
}

export function AimIpProfileDialog({ open, projectId, onOpenChange }: AimIpProfileDialogProps) {
  const { form, setForm, loading, saving, hasPages, savedPages, save } = useIpProfileState(
    projectId,
    open,
    useCallback(() => onOpenChange(false), [onOpenChange]),
  )

  const completeness = computeProfileCompleteness({
    pages: IP_PROFILE_PAGE_ORDER.map((pageType) => ({
      pageType,
      content: savedPages.find((page) => page.pageType === pageType)?.content ?? "",
    })),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUser className="size-4" />
            IP 档案
          </DialogTitle>
          <DialogDescription>
            填一次，生成时整块带给模型——我是谁、卖什么、服务谁，它就不用猜了。
            {hasPages ? " 已回填现有档案页，直接在原稿上改。" : " 还没有档案，从空白开始填。"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> 正在读取档案…
          </div>
        ) : (
          <div className="space-y-4">
            <CompletenessBanner hints={completeness.missingFieldHints} />
            {IP_PROFILE_PAGE_ORDER.map((pageType) => (
              <ProfilePageSection key={pageType} pageType={pageType} form={form} setForm={setForm} />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={() => void save()} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Save className="mr-2 size-4" />}
            保存档案
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
