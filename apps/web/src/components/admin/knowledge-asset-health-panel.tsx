"use client"

import { CATEGORY_LABELS } from "@/lib/knowledge-categories"
import {
  getSupplementPrompts,
  type AssetBoxHealth,
  type AssetBoxId,
  type KnowledgeAssetHealthResult,
} from "@/lib/knowledge-asset-health"
import type { KnowledgeCategory } from "@/lib/knowledge-categories"

function statusTone(status: AssetBoxHealth["status"]): string {
  if (status === "ready") {
    return "border-primary/25 bg-secondary/60 text-foreground"
  }
  if (status === "pending_confirm") {
    return "border-amber-700/30 bg-amber-50 text-amber-950 dark:border-primary/30 dark:bg-secondary dark:text-foreground"
  }
  return "border-primary/40 bg-primary/[0.06] text-foreground"
}

function statusBadgeTone(status: AssetBoxHealth["status"]): string {
  if (status === "ready") {
    return "bg-secondary text-foreground"
  }
  if (status === "pending_confirm") {
    return "bg-amber-100 text-amber-900 dark:bg-secondary dark:text-primary"
  }
  return "bg-primary text-primary-foreground"
}

export interface KnowledgeAssetHealthPanelProps {
  health: KnowledgeAssetHealthResult
  /** 点击盒子：筛选该类条目 */
  onSelectBox: (box: AssetBoxHealth) => void
  /** 点击待补充/待确认：引导现有录入入口 */
  onSupplement: (input: {
    boxId: AssetBoxId
    category: KnowledgeCategory
    prompts: string[]
  }) => void
}

/**
 * @description 项目内知识资产五盒健康度（确定性，无百分制）
 */
export function KnowledgeAssetHealthPanel({
  health,
  onSelectBox,
  onSupplement,
}: KnowledgeAssetHealthPanelProps) {
  return (
    <section className="mb-4 rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-foreground">知识资产健康度</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            看清创作前还缺什么资料。状态只有「已具备 / 待补充 / 待确认」，不做分数。
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          {health.dynamicPool.label}
          <span className="mx-1 text-border">·</span>
          {health.dynamicPool.count} 条（不计入五盒）
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {health.boxes.map((box) => {
          const category =
            box.suggestedCategory ??
            box.missingCategories[0] ??
            box.categories[0]
          const prompts =
            category != null ? getSupplementPrompts(box.id, category) : []

          return (
            <div
              key={box.id}
              className={`flex flex-col rounded-lg border p-3 ${statusTone(box.status)}`}
            >
              <button
                type="button"
                onClick={() => onSelectBox(box)}
                className="text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold leading-snug">{box.label}</h3>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${statusBadgeTone(box.status)}`}
                  >
                    {box.statusLabel}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {box.question}
                </p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {box.entryCount} 条
                  {box.pendingVerifyCount > 0
                    ? ` · ${box.pendingVerifyCount} 条待确认`
                    : ""}
                </p>
              </button>

              {box.status === "missing" || box.status === "pending_confirm" ? (
                <div className="mt-3 space-y-2 border-t border-border/60 pt-2">
                  {prompts.length > 0 ? (
                    <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
                      {prompts.map((prompt) => (
                        <li key={prompt}>· {prompt}</li>
                      ))}
                    </ul>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      if (!category) return
                      onSupplement({ boxId: box.id, category, prompts })
                    }}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {box.status === "missing"
                      ? `去补「${CATEGORY_LABELS[category] ?? category}」`
                      : `去确认「${CATEGORY_LABELS[category] ?? category}」`}
                  </button>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </section>
  )
}
