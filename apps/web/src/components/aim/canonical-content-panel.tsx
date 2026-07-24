"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { confirmAimCanonicalContent } from "@/lib/api/aim"
import { KnowledgeCitationPanel } from "@/components/aim/knowledge-citation-panel"
import {
  buildCanonicalContentSpec,
  buildCanonicalSourceView,
  getCanonicalFromTaskSpec,
  isCanonicalConfirmed,
  type CanonicalContentSpec,
} from "@/lib/canonical-content-spec"
import type { TaskSpec } from "@/lib/task-spec"
import type { AimKnowledgeUsedRef } from "@/lib/aim-knowledge-cite"

export interface CanonicalContentPanelProps {
  generationId: string
  taskSpec?: TaskSpec | null
  knowledgeUsed?: AimKnowledgeUsedRef[]
  rawInputHint?: string
  onUpdated?: (input: { canonical: CanonicalContentSpec; taskSpec: TaskSpec }) => void
}

/**
 * @description 母内容来源可视化 + 确认/修订（不暴露 Prompt）
 */
export function CanonicalContentPanel({
  generationId,
  taskSpec,
  knowledgeUsed = [],
  rawInputHint,
  onUpdated,
}: CanonicalContentPanelProps) {
  const initial = useMemo(() => {
    const fromSpec = getCanonicalFromTaskSpec(taskSpec)
    if (fromSpec) return fromSpec
    if (!taskSpec) return null
    return buildCanonicalContentSpec({
      taskSpec,
      currentInput: rawInputHint,
      knowledgeUsed,
    })
  }, [taskSpec, knowledgeUsed, rawInputHint])

  const [canonical, setCanonical] = useState<CanonicalContentSpec | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftMessage, setDraftMessage] = useState("")
  const [draftCustomer, setDraftCustomer] = useState("")
  const [draftProblem, setDraftProblem] = useState("")
  const [draftAction, setDraftAction] = useState("")

  useEffect(() => {
    if (!initial) {
      setCanonical(null)
      return
    }
    setCanonical(initial)
    setDraftMessage(initial.coreMessage)
    setDraftCustomer(initial.targetCustomer)
    setDraftProblem(initial.realProblem)
    setDraftAction(initial.desiredAction)
  }, [initial])

  if (!canonical || !taskSpec) return null

  const view = buildCanonicalSourceView(canonical)
  const confirmed = isCanonicalConfirmed(canonical)
  const citeRefs = knowledgeUsed.length > 0 ? knowledgeUsed : view.knowledgeUsed

  async function handleConfirm() {
    setSaving(true)
    try {
      const result = await confirmAimCanonicalContent({
        generationId,
        action: confirmed && editing ? "revise" : "confirm",
        canonical: editing
          ? {
              ...canonical,
              coreMessage: draftMessage,
              targetCustomer: draftCustomer,
              realProblem: draftProblem,
              desiredAction: draftAction,
            }
          : undefined,
      })
      setCanonical(result.canonical)
      setEditing(false)
      onUpdated?.({ canonical: result.canonical, taskSpec: result.taskSpec })
      toast.success(
        result.canonical.version > 1
          ? `母内容已更新为 v${result.canonical.version}`
          : "母内容已确认，可作为多平台派生基准",
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "母内容确认失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-2 rounded-lg border border-border bg-card p-2.5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold text-foreground">母内容</h3>
          <p className="text-[10px] text-muted-foreground">
            确认后冻结核心观点与证据；拆多平台不得改事实。
            {confirmed ? ` · 当前 v${canonical.version}` : " · 草稿待确认"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => setEditing((value) => !value)}
          >
            {editing ? "收起编辑" : "调整要点"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={saving || (confirmed && !editing)}
            onClick={() => void handleConfirm()}
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {confirmed && editing ? "保存为新版本" : confirmed ? "已确认" : "确认母内容"}
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">核心观点</Label>
            <Textarea
              className="min-h-16 text-sm"
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">目标客户</Label>
            <Input
              className="h-8 text-sm"
              value={draftCustomer}
              onChange={(event) => setDraftCustomer(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">期望行动</Label>
            <Input
              className="h-8 text-sm"
              value={draftAction}
              onChange={(event) => setDraftAction(event.target.value)}
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">真实问题</Label>
            <Textarea
              className="min-h-14 text-sm"
              value={draftProblem}
              onChange={(event) => setDraftProblem(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="mb-3 space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">核心观点 · </span>
            {canonical.coreMessage || "（待补充）"}
          </p>
          <p>
            <span className="text-muted-foreground">目标 · </span>
            {canonical.contentGoal}
            <span className="mx-1 text-border">/</span>
            {canonical.targetCustomer || "（待补充）"}
          </p>
          <p>
            <span className="text-muted-foreground">问题 · </span>
            {canonical.realProblem || "（待补充）"}
          </p>
          <p>
            <span className="text-muted-foreground">承接 · </span>
            {canonical.desiredAction}
          </p>
        </div>
      )}

      <div className="grid gap-2 text-[11px] leading-relaxed text-muted-foreground sm:grid-cols-2">
        <SourceBlock title="当前输入" empty="无">
          {view.currentInput ? <li>{view.currentInput}</li> : null}
        </SourceBlock>
        <div className="rounded-lg border border-border/70 bg-secondary/30 px-2.5 py-2">
          <p className="mb-1 font-medium text-foreground">采用的知识</p>
          {citeRefs.length > 0 ? (
            <KnowledgeCitationPanel knowledgeUsed={citeRefs} compact className="" />
          ) : (
            <p>未引用知识条目</p>
          )}
        </div>
        <SourceBlock title="企业事实 / 证据" empty="暂无已锚定事实">
          {view.enterpriseFacts.map((item, index) => (
            <li key={`${item.statement}-${index}`}>
              {item.statement}
              {item.sourceLabel ? `（${item.sourceLabel}）` : ""}
            </li>
          ))}
        </SourceBlock>
        <SourceBlock title="动态素材（热点/对标）" empty="未采用动态素材">
          {view.dynamicMaterials.map((item, index) => (
            <li key={`${item.statement}-${index}`}>{item.statement}</li>
          ))}
        </SourceBlock>
        <SourceBlock title="尚缺证据" empty="关键证据已齐">
          {view.missingEvidence.map((item) => (
            <li key={item} className="text-primary">
              {item}
            </li>
          ))}
        </SourceBlock>
        <SourceBlock title="模型假设" empty="无额外假设">
          {view.modelAssumptions.map((item) => (
            <li key={item.statement}>{item.statement}</li>
          ))}
        </SourceBlock>
      </div>
    </section>
  )
}

function SourceBlock({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: ReactNode
}) {
  const hasItems = Boolean(
    Array.isArray(children)
      ? children.some(Boolean)
      : children,
  )
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/30 px-2.5 py-2">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      {hasItems ? <ul className="space-y-0.5">{children}</ul> : <p>{empty}</p>}
    </div>
  )
}
