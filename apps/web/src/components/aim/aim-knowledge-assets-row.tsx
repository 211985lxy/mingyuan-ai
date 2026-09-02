"use client"

import { useState } from "react"
import { Flame, Loader2 } from "lucide-react"
import { toast } from "sonner"

import {
  buildBenchmarkMethodologyPage,
  hasBenchmarkMethodologyMaterial,
  type BenchmarkMethodologyInput,
} from "@/lib/aim/benchmark-methodology-save"

export interface AimKnowledgeAssetsRowProps extends BenchmarkMethodologyInput {
  projectId: string
  onOpenIpProfile: () => void
}

function entryClass() {
  return "text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
}

/**
 * 知识资产入口行：IP 档案（填一次整块带上）+ 爆款方法论（本次对标拆解一键沉淀）。
 * 两个入口都是"用户显式动作"，对应双资产注入模型——生成时模型不猜。
 */
export function AimKnowledgeAssetsRow({
  projectId,
  onOpenIpProfile,
  sourceOriginalText,
  sourceAnalysisText,
  sourceTopicTitle,
}: AimKnowledgeAssetsRowProps) {
  const [saving, setSaving] = useState(false)
  const hasBenchmark = hasBenchmarkMethodologyMaterial({ sourceOriginalText, sourceAnalysisText })

  async function saveMethodology() {
    const page = buildBenchmarkMethodologyPage({ sourceOriginalText, sourceAnalysisText, sourceTopicTitle })
    if (!page) return
    setSaving(true)
    try {
      const res = await fetch("/api/aim/ip-wiki/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, pages: [page] }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "保存失败")
      toast.success(`已存为「${page.title}」`, { description: "之后生成时说「结合项目资料」即可带上这套打法。" })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 px-3 py-1 sm:px-5">
      <button type="button" onClick={onOpenIpProfile} className={entryClass()}>
        IP 档案 · 填一次，生成时整块带上（我是谁 / 卖什么 / 服务谁）
      </button>
      {hasBenchmark ? (
        <button type="button" onClick={() => void saveMethodology()} disabled={saving} className={entryClass()}>
          {saving ? <Loader2 className="mr-1 inline size-3 animate-spin align-[-2px]" /> : <Flame className="mr-1 inline size-3 align-[-2px]" />}
          把本次对标拆解存为「爆款方法论」
        </button>
      ) : null}
    </div>
  )
}
