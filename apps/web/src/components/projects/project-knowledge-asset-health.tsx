"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  createKnowledge,
  fetchKnowledgeAssetHealth,
} from "@/lib/api/knowledge"
import { CATEGORY_LABELS, type KnowledgeCategory } from "@/lib/knowledge-categories"
import {
  HEALTH_STATUS_LABELS,
  getSupplementPrompts,
  type AssetBoxHealth,
  type KnowledgeAssetHealthResult,
  type KnowledgeAssetHealthStatus,
} from "@/lib/knowledge-asset-health"
import { buildDefaultKnowledgeTags } from "@/lib/knowledge-tags"
import { cn } from "@/lib/utils"

interface ProjectKnowledgeAssetHealthProps {
  projectId: string
}

function statusChipClass(status: KnowledgeAssetHealthStatus): string {
  if (status === "ready") {
    return "border-border/80 bg-secondary/50 text-muted-foreground"
  }
  if (status === "pending_confirm") {
    return "border-amber-700/25 bg-amber-50 text-amber-950 dark:border-primary/30 dark:bg-secondary dark:text-foreground"
  }
  return "border-primary/35 bg-primary/[0.08] text-foreground"
}

/**
 * 用户端项目内容资产：一行五盒状态，点缺口可补录。
 */
export function ProjectKnowledgeAssetHealth({ projectId }: ProjectKnowledgeAssetHealthProps) {
  const [health, setHealth] = useState<KnowledgeAssetHealthResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    category: "positioning_material" as KnowledgeCategory,
    title: "",
    content: "",
    prompts: [] as string[],
  })

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const payload = await fetchKnowledgeAssetHealth(projectId)
      setHealth(payload.health)
    } catch {
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleSave() {
    const title = form.title.trim()
    const content = form.content.trim()
    if (!title || !content) {
      toast.error("请填写标题和内容")
      return
    }
    setSaving(true)
    try {
      await createKnowledge({
        projectId,
        category: form.category,
        title,
        content,
        tags: buildDefaultKnowledgeTags(form.category),
        sourceType: "manual",
      })
      toast.success("已写入知识库")
      setDialogOpen(false)
      setForm((current) => ({ ...current, title: "", content: "" }))
      await reload()
    } catch {
      toast.error("写入失败，请稍后重试")
    } finally {
      setSaving(false)
    }
  }

  function openSupplement(box: AssetBoxHealth) {
    const category =
      box.suggestedCategory ??
      box.missingCategories[0] ??
      box.categories[0]
    if (!category) {
      toast.message("这一盒暂时没有可补录的类目")
      return
    }
    setForm({
      category,
      title: "",
      content: "",
      prompts: getSupplementPrompts(box.id, category),
    })
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        检查资产…
      </div>
    )
  }

  if (!health) return null

  return (
    <>
      <div className="flex flex-wrap gap-1">
        {health.boxes.map((box) => {
          const interactive = box.status !== "ready"
          return (
            <button
              key={box.id}
              type="button"
              disabled={!interactive}
              title={`${box.label} · ${HEALTH_STATUS_LABELS[box.status]}${interactive ? "（点击补录）" : ""}`}
              onClick={() => {
                if (interactive) openSupplement(box)
              }}
              className={cn(
                "inline-flex h-6 max-w-full items-center gap-1 rounded-md border px-1.5 text-[11px] leading-none",
                statusChipClass(box.status),
                interactive
                  ? "cursor-pointer transition-colors hover:border-primary/50 hover:bg-primary/10"
                  : "cursor-default opacity-90",
              )}
            >
              <span className="truncate font-medium">{box.label}</span>
              <span className="shrink-0 opacity-70">{HEALTH_STATUS_LABELS[box.status]}</span>
            </button>
          )
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              补录「{CATEGORY_LABELS[form.category] ?? form.category}」
            </DialogTitle>
            <DialogDescription>
              只补当前缺口，写入现有知识库，不另开第二套页面。
            </DialogDescription>
          </DialogHeader>
          {form.prompts.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              {form.prompts.map((prompt) => (
                <li key={prompt}>· {prompt}</li>
              ))}
            </ul>
          ) : null}
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor={`kb-title-${projectId}`}>标题</Label>
              <Input
                id={`kb-title-${projectId}`}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="一句话概括这条资料"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`kb-content-${projectId}`}>内容</Label>
              <Textarea
                id={`kb-content-${projectId}`}
                value={form.content}
                className="min-h-28"
                onChange={(event) =>
                  setForm((current) => ({ ...current, content: event.target.value }))
                }
                placeholder="把可复用的事实、案例或话术写清楚"
              />
            </div>
            <Button className="w-full" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              写入知识库
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
