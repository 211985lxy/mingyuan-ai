"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react"
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
import { KnowledgeAssetHealthPanel } from "@/components/admin/knowledge-asset-health-panel"
import { ExpressionStylePanel } from "@/components/projects/expression-style-panel"
import {
  createKnowledge,
  fetchKnowledgeAssetHealth,
} from "@/lib/api/knowledge"
import { CATEGORY_LABELS, type KnowledgeCategory } from "@/lib/knowledge-categories"
import {
  HEALTH_STATUS_LABELS,
  getSupplementPrompts,
  type AssetBoxId,
  type KnowledgeAssetHealthResult,
} from "@/lib/knowledge-asset-health"
import { buildDefaultKnowledgeTags } from "@/lib/knowledge-tags"

interface ProjectKnowledgeAssetHealthProps {
  projectId: string
}

/**
 * 用户端项目内容资产：五盒健康度 +「我的表达风格」管理。
 */
export function ProjectKnowledgeAssetHealth({ projectId }: ProjectKnowledgeAssetHealthProps) {
  const [focusStyle, setFocusStyle] = useState(false)
  const [health, setHealth] = useState<KnowledgeAssetHealthResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    category: "positioning_material" as KnowledgeCategory,
    title: "",
    content: "",
    prompts: [] as string[],
  })

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const focus = params.get("focus") === "style"
    const focusedProject = params.get("projectId")
    const shouldFocus = focus && (!focusedProject || focusedProject === projectId)
    setFocusStyle(shouldFocus)
    if (shouldFocus) setExpanded(true)
  }, [projectId])

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

  function openSupplement(input: {
    boxId: AssetBoxId
    category: KnowledgeCategory
    prompts: string[]
  }) {
    if (input.category === "writing_style_profile") {
      setExpanded(true)
      return
    }
    const prompts =
      input.prompts.length > 0
        ? input.prompts
        : getSupplementPrompts(input.boxId, input.category)
    setForm({
      category: input.category,
      title: "",
      content: "",
      prompts,
    })
    setDialogOpen(true)
  }

  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        正在检查内容资产…
      </div>
    )
  }

  if (!health) return null

  const missingCount = health.boxes.filter((box) => box.status !== "ready").length
  const firstGap = health.boxes.find((box) => box.status !== "ready")

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="inline-flex items-center gap-1 text-xs font-medium text-foreground hover:text-primary"
        >
          内容资产
          {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
        <span className="text-xs text-muted-foreground">
          {missingCount === 0
            ? "五盒已齐"
            : `${missingCount} 项${firstGap ? HEALTH_STATUS_LABELS[firstGap.status] : "待处理"}`}
        </span>
        {firstGap?.suggestedCategory ? (
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            onClick={() =>
              openSupplement({
                boxId: firstGap.id,
                category: firstGap.suggestedCategory!,
                prompts: [],
              })
            }
          >
            去补资料
          </button>
        ) : null}
      </div>

      {expanded ? (
        <>
          <KnowledgeAssetHealthPanel
            health={health}
            title="内容资产"
            onSelectBox={() => {
              /* 用户端无条目列表，点击盒子不筛选 */
            }}
            onSupplement={openSupplement}
          />
          <ExpressionStylePanel projectId={projectId} autoExpandFeed={focusStyle} />
        </>
      ) : null}

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
    </div>
  )
}
