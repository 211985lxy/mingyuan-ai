"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { archiveKnowledge, listKnowledge, type KnowledgeEntry } from "@/lib/api/knowledge"
import { STYLE_PROFILE_CATEGORY, STYLE_PROFILE_MAIN_TITLE } from "@/lib/style-profile-constants"

export type StyleSampleDraft = { id: string; content: string; label: "core" | "normal" }

async function loadStyleProfile(projectId: string): Promise<KnowledgeEntry | null> {
  const entries = await listKnowledge({
    projectId,
    category: STYLE_PROFILE_CATEGORY,
    status: "active",
  })
  return entries.find((e) => e.title === STYLE_PROFILE_MAIN_TITLE) ?? entries[0] ?? null
}

export function useExpressionStylePanel(projectId: string, autoExpandFeed = false) {
  const [profile, setProfile] = useState<KnowledgeEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [feedOpen, setFeedOpen] = useState(autoExpandFeed)
  const [samples, setSamples] = useState<StyleSampleDraft[]>([{ id: "s1", content: "", label: "core" }])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewSamples, setPreviewSamples] = useState<Array<{ content: string; label?: "core" | "normal" }>>([])
  const [archiving, setArchiving] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try { setProfile(await loadStyleProfile(projectId)) }
    catch { setProfile(null) }
    finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { void reload() }, [reload])
  useEffect(() => { if (autoExpandFeed) setFeedOpen(true) }, [autoExpandFeed])

  function addSample() {
    if (samples.length >= 10) return toast.error("一次最多 10 篇样本")
    setSamples((prev) => [...prev, { id: `s${Date.now()}`, content: "", label: "normal" }])
  }

  function startPreview() {
    const cleaned = samples.map((s) => ({ content: s.content.trim(), label: s.label })).filter((s) => s.content)
    if (!cleaned.length) return toast.error("请至少粘贴一篇有效文案")
    if (cleaned.length > 10) return toast.error("一次最多分析 10 篇样本")
    setPreviewSamples(cleaned)
    setPreviewOpen(true)
  }

  async function handleArchive() {
    if (!profile) return
    if (!window.confirm("确认归档当前表达风格档案？可在知识库中恢复，不会硬删除。")) return
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

  function onPreviewCommitted() {
    setFeedOpen(false)
    setSamples([{ id: "s1", content: "", label: "core" }])
    void reload()
  }

  return {
    profile, loading, feedOpen, setFeedOpen, samples, setSamples,
    previewOpen, setPreviewOpen, previewSamples, archiving,
    addSample, startPreview, handleArchive, onPreviewCommitted,
  }
}
