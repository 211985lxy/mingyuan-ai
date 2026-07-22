"use client"

import { Check, RotateCcw, Send, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type { PlanAssumption, PlanTaskSpec, PlanTaskSpecField } from "@/lib/aim/plan-types"

interface AimPlanTaskSpecCardProps {
  taskSpec: Partial<PlanTaskSpec>
  assumptions: PlanAssumption[]
  requirement: string
  busy: boolean
  onConfirm: () => void
  onAbandon: () => void
  onReSelect: (field: string) => void
}

/** 任务单字段配置：标签 + 对应 taskSpec key */
const FIELD_CONFIG: Array<{ key: keyof PlanTaskSpec; label: string }> = [
  { key: "contentGoal", label: "内容目标" },
  { key: "coreMessage", label: "核心信息" },
  { key: "targetCustomer", label: "目标受众" },
  { key: "realProblem", label: "真实痛点" },
  { key: "platform", label: "发布平台" },
  { key: "useScenario", label: "使用场景" },
  { key: "outputFormat", label: "输出格式" },
  { key: "style", label: "风格" },
  { key: "lengthRule", label: "长度要求" },
  { key: "ctaText", label: "CTA" },
  { key: "mustKeep", label: "必须保留" },
  { key: "avoid", label: "禁区" },
]

/**
 * 计划模式 · 最终任务单卡片
 *
 * 展示结构化任务单，每个字段支持"重新选择"；不提供大段空表。
 * 只有用户点击"确认并生成"才进入现有 AIM 生成链路。
 */
export function AimPlanTaskSpecCard({
  taskSpec,
  assumptions,
  requirement,
  busy,
  onConfirm,
  onAbandon,
  onReSelect,
}: AimPlanTaskSpecCardProps) {
  const filledFields = FIELD_CONFIG.filter(({ key }) => taskSpec[key]?.trim())
  const assumptionFields = new Set(assumptions.map((a) => a.field))

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="rounded-xl border border-primary/20 bg-card shadow-sm">
        {/* 标题 */}
        <div className="border-b px-4 py-3">
          <p className="text-sm font-medium">任务单确认</p>
          <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            需求：{requirement}
          </p>
        </div>

        {/* 字段列表 */}
        <div className="flex flex-col divide-y px-4">
          {filledFields.map(({ key, label }) => {
            const isAssumed = assumptionFields.has(key as PlanTaskSpecField)
            const assumption = assumptions.find((a) => a.field === key)
            return (
              <div key={key} className="flex items-start gap-3 py-2.5">
                <span className="mt-0.5 w-16 shrink-0 text-xs text-muted-foreground">{label}</span>
                <span className="min-w-0 flex-1 text-sm leading-relaxed">
                  {taskSpec[key]}
                  {isAssumed && assumption && (
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px] font-normal align-middle">
                      档案：{assumption.sourceRefs[0]?.label ?? "项目"}
                    </Badge>
                  )}
                </span>
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/60 transition-colors hover:text-primary"
                  onClick={() => onReSelect(key)}
                  title="重新选择"
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              </div>
            )
          })}

          {filledFields.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              暂无已确认字段，请返回补充选择
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs text-muted-foreground"
            onClick={onAbandon}
            disabled={busy}
          >
            <X className="h-3.5 w-3.5" />
            放弃计划
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onConfirm}
            disabled={busy || filledFields.length === 0}
          >
            {busy ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            确认并生成
          </Button>
        </div>
      </div>
    </div>
  )
}
