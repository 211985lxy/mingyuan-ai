import type { AimAgentId } from "@/lib/aim-ui-config"
import {
  COPY_STUDIO_MODULES,
  COPY_STUDIO_MODULE_LABELS,
  type CopyStudioModule,
} from "@/lib/copy-studio"

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
    <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">创作模式</span>
      <button type="button" className={`rounded-md border px-2.5 py-1 text-xs ${value === undefined ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`} onClick={() => onChange(undefined)}>智能选择</button>
      {COPY_STUDIO_MODULES.map((module) => (
        <button key={module} type="button" className={`rounded-md border px-2.5 py-1 text-xs ${value === module ? "border-primary bg-primary/10 text-primary" : "bg-background text-muted-foreground"}`} onClick={() => onChange(module)}>{COPY_STUDIO_MODULE_LABELS[module]}</button>
      ))}
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
