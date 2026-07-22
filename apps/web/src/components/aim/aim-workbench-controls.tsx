import { useEffect, useState } from "react"
import type { AimAgentId } from "@/lib/aim-ui-config"
import {
  COPY_STUDIO_MODULES,
  COPY_STUDIO_MODULE_LABELS,
  type CopyStudioModule,
} from "@/lib/copy-studio"
import { fetchMethodologyProfiles, type MethodologyProfileSummary } from "@/lib/api/aim"

/**
 * @description aimcontentmodeselector
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AimContentModeSelector({
  value,
  onChange,
}: {
  value: CopyStudioModule | undefined
  onChange: (value: CopyStudioModule | undefined) => void
}) {
  return (
    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">创作模式</span>
      <button type="button" className={`rounded-md border px-2.5 py-1 text-xs ${value === undefined ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`} onClick={() => onChange(undefined)}>智能选择</button>
      {COPY_STUDIO_MODULES.map((module) => (
        <button key={module} type="button" className={`rounded-md border px-2.5 py-1 text-xs ${value === module ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`} onClick={() => onChange(module)}>{COPY_STUDIO_MODULE_LABELS[module]}</button>
      ))}
    </div>
  )
}

/**
 * 命名方法论选择器（ADR-002）。MVP 单选。
 *
 * 列表来自 /api/methodology-profiles（功能开关关闭时返回空数组，组件自动隐藏）。
 * 默认「不指定」；选中后把 profile id 写入 selectedMethodologyProfileIds（最多 1 个）。
 *
 * @description aimmethodologyselector
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AimMethodologySelector({
  value,
  onChange,
}: {
  value: string[]
  onChange: (value: string[]) => void
}) {
  const [profiles, setProfiles] = useState<MethodologyProfileSummary[]>([])

  useEffect(() => {
    let active = true
    fetchMethodologyProfiles()
      .then((list) => {
        if (active) setProfiles(list)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  // 后端功能开关关闭或无可见方法论时，隐藏选择器（恢复当前行为）
  if (profiles.length === 0) return null

  const selectedId = value[0]
  const selected = profiles.find((p) => p.id === selectedId)

  return (
    <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">参考方法论</span>
      <button
        type="button"
        className={`rounded-md border px-2.5 py-1 text-xs ${!selectedId ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
        onClick={() => onChange([])}
      >
        不指定
      </button>
      {profiles.map((profile) => (
        <button
          key={profile.id}
          type="button"
          title={profile.description ?? profile.originatorName ?? undefined}
          className={`rounded-md border px-2.5 py-1 text-xs ${selectedId === profile.id ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`}
          onClick={() => onChange(selectedId === profile.id ? [] : [profile.id])}
        >
          {profile.name}
          {profile.latestVersion ? ` v${profile.latestVersion}` : ""}
        </button>
      ))}
      {selected && (
        <span className="text-xs text-muted-foreground">
          借鉴方法与框架，不模仿作者语言风格
        </span>
      )}
    </div>
  )
}

const RESEARCH_AGENT_IDS = new Set<AimAgentId>(["business_system_diagnosis", "business_diagnosis"])

/**
 * @description aimresearchhint
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AimResearchHint({ agentId }: { agentId: AimAgentId }) {
  if (!RESEARCH_AGENT_IDS.has(agentId)) return null
  return <p className="mx-auto mb-2 hidden max-w-2xl text-xs text-muted-foreground lg:block">可以直接把官网链接、竞品资料、客户资料或 Research Agent 资料包粘贴到聊天框里，系统会作为诊断上下文使用。</p>
}
