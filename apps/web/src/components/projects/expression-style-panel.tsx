"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { AimStylePreviewDialog } from "@/components/aim/aim-style-preview-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { archiveKnowledge, listKnowledge, type KnowledgeEntry } from "@/lib/api/knowledge"
import { STYLE_PROFILE_CATEGORY, STYLE_PROFILE_MAIN_TITLE } from "@/lib/style-profile"

type SampleDraft = {
  id: string
  content: string
  label: "core" | "normal"
}

interface ExpressionStylePanelProps {
  projectId: string
  /** URL focus=style 时自动展开投喂区 */
  autoExpandFeed?: boolean
}

/**
 * 「我是谁 → 我的表达风格」：查看档案、批量投喂预览确认、归档。
 */
export function ExpressionStylePanel({ projectId, autoExpandFeed = false }: ExpressionStylePanelProps) {
  const [profile, setProfile] = useState<KnowledgeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedOpen, setFeedOpen] = useState(autoExpandFeed)
  const [samples, setSamples] = useState<SampleDraft[]>([
    { id: "s1", content: "", label: "core" },
  ])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSamples, setPreviewSamples] = useState<Array<{ content: string; label?: "core" | "normal" }>>([])
  const [archiving, setArchiving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await listKnowledge({
        projectId,
        category: STYLE_PROFILE_CATEGORY,
        status: "active",
      })
      const main =
        entries.find((e) => e.title === STYLE_PROFILE_MAIN_TITLE) ??
        entries[0] ??
        null
      setProfile(main)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    if (autoExpandFeed) setFeedOpen(true)
  }, [autoExpandFeed])

  function addSample() {
    if (samples.length >= 10) {
      toast.error("一次最多 10 篇样本")
      return
    }
    setSamples((prev) => [
      ...prev,
      { id: `s${Date.now()}`, content: "", label: "normal" },
    ])
  }

  function startPreview() {
    const cleaned = samples
      .map((s) => ({ content: s.content.trim(), label: s.label }))
      .filter((s) => s.content.length > 0)
    if (cleaned.length === 0) {
      toast.error("请至少粘贴一篇有效文案")
      return
    }
    if (cleaned.length > 10) {
      toast.error("一次最多分析 10 篇样本")
      return
    }
    setPreviewSamples(cleaned)
    setPreviewOpen(true)
  }

  async function handleArchive() {
    if (!profile) return
    const ok = window.confirm("确认归档当前表达风格档案？可在知识库中恢复，不会硬删除。")
    if (!ok) return
    setArchiving(true)
    try {
      await archiveKnowledge(profile.id)
      toast.success("已归档风格档案")
      setProfile(null)
      await reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "归档失败")
    } finally {
      setArchiving(false)
    }
  }

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        加载表达风格…
      </div>
    )
  }

  const updatedLabel = profile?.updatedAt
    ? new Date(profile.updatedAt).toLocaleString("zh-CN")
    : null

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border/70 bg-background/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">我的表达风格</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {profile
              ? `已启用 · 更新于 ${updatedLabel}`
              : "尚未建立项目风格档案（生成时会回退个人全局风格）"}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setFeedOpen((v) => !v)}>
            {feedOpen ? "收起投喂" : "添加历史文案"}
          </Button>
          <Link
            href="/aim"
            className="inline-flex h-7 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            重新测试生成
          </Link>
          {profile ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-destructive"
              disabled={archiving}
              onClick={() => void handleArchive()}
            >
              归档
            </Button>
          ) : null}
        </div>
      </div>

      {profile ? (
        <pre className="max-h-36 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-2 text-[11px] leading-5 text-muted-foreground">
          {profile.content.slice(0, 1200)}
          {profile.content.length > 1200 ? "…" : ""}
        </pre>
      ) : null}

      {feedOpen ? (
        <div className="space-y-3 border-t border-border/60 pt-3">
          <p className="text-xs text-muted-foreground">
            粘贴 1—10 篇纯文本。可标「核心样本 / 普通样本」。分析后先预览，确认才写入。
          </p>
          {samples.map((sample, index) => (
            <div key={sample.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">样本 {index + 1}</Label>
                <select
                  className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                  value={sample.label}
                  onChange={(event) => {
                    const label = event.target.value as "core" | "normal"
                    setSamples((prev) =>
                      prev.map((item) => (item.id === sample.id ? { ...item, label } : item)),
                    )
                  }}
                >
                  <option value="core">核心样本</option>
                  <option value="normal">普通样本</option>
                </select>
              </div>
              <Textarea
                className="min-h-20 text-sm"
                value={sample.content}
                placeholder="粘贴一篇你以前写的文案…"
                onChange={(event) => {
                  const content = event.target.value
                  setSamples((prev) =>
                    prev.map((item) => (item.id === sample.id ? { ...item, content } : item)),
                  )
                }}
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={addSample}>
              再加一篇
            </Button>
            <Button type="button" size="sm" className="h-8 text-xs" onClick={startPreview}>
              分析并预览
            </Button>
          </div>
        </div>
      ) : null}

      <AimStylePreviewDialog
        open={previewOpen}
        samples={previewSamples}
        projectId={projectId}
        onOpenChange={setPreviewOpen}
        onCommitted={() => {
          setFeedOpen(false)
          setSamples([{ id: "s1", content: "", label: "core" }])
          void reload()
        }}
      />
    </div>
  )
}
