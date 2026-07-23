"use client"

import { useState } from "react"
import { AlertTriangle, Check, Pencil, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { AimTurnIntent } from "@/lib/aim-turn-intent"
import { applyTurnIntentSupplement } from "@/lib/aim-turn-intent"

interface AimTurnIntentConfirmBarProps {
  intent: AimTurnIntent
  busy?: boolean
  /** rule | vector | rule_kept | shadow */
  source?: string
  onConfirm: (intent: AimTurnIntent) => void
  onCancel: () => void
}

/**
 * 生成前本轮意图确认条。
 * 「补充说明」不改 action/scope/keep/avoid，避免与结构化意图自相矛盾。
 */
export function AimTurnIntentConfirmBar({
  intent,
  busy = false,
  source,
  onConfirm,
  onCancel,
}: AimTurnIntentConfirmBarProps) {
  const [editing, setEditing] = useState(false)
  const [supplement, setSupplement] = useState(intent.userSupplement || "")

  const confirm = () => {
    onConfirm(editing || supplement.trim()
      ? applyTurnIntentSupplement(intent, supplement)
      : intent)
  }

  const sourceHint = source === "vector"
    ? "近义匹配已辅助辨认，请确认结构化意图是否正确"
    : "请确认行动/范围/交付是否听对。需要补充约束时用「补充说明」，不会改结构化字段。"

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-primary/25 bg-card shadow-sm">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">本轮意图确认</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sourceHint}</p>
        </div>

        <div className="space-y-3 px-4 py-3">
          <p className="text-sm leading-relaxed">{intent.summary}</p>

          <div className="flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-md bg-muted px-2 py-0.5">交付：{intent.deliverable}</span>
            <span className="rounded-md bg-muted px-2 py-0.5">行动：{intent.action}</span>
            <span className="rounded-md bg-muted px-2 py-0.5">范围：{intent.scope}</span>
          </div>

          {intent.keep.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">保留：</span>
              {intent.keep.join("；")}
            </p>
          ) : null}

          {intent.avoid.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">禁止：</span>
              {intent.avoid.join("；")}
            </p>
          ) : null}

          {intent.archiveGaps.length > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                <AlertTriangle className="size-3.5 shrink-0" />
                档案缺口（仍可生成，但会标「待补充」、禁止编造）
              </p>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-amber-900/80 dark:text-amber-100/80">
                {intent.archiveGaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {editing ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">补充说明（可选）</p>
              <Textarea
                value={supplement}
                onChange={(e) => setSupplement(e.target.value)}
                rows={2}
                className="text-sm"
                disabled={busy}
                placeholder="例如：语气再口语一点；不要提竞品名…"
              />
            </div>
          ) : intent.userSupplement ? (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">补充：</span>
              {intent.userSupplement}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onCancel}>
            <X className="size-3.5" />
            取消
          </Button>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (editing) setSupplement(intent.userSupplement || "")
                setEditing((v) => !v)
              }}
            >
              <Pencil className="size-3.5" />
              {editing ? "收起补充" : "补充说明"}
            </Button>
            <Button type="button" size="sm" disabled={busy} onClick={confirm}>
              <Check className="size-3.5" />
              {intent.archiveGaps.length ? "仍要生成" : "确认并生成"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
