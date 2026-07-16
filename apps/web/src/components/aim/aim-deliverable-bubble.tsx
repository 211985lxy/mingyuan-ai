"use client"

import { memo, useMemo, useState } from "react"
import { ArrowRight, Check, Clipboard, Database, ShieldCheck, Sparkles, Target } from "lucide-react"
import { toast } from "sonner"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { ActionStrip } from "@/components/workbench/action-strip"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AimNextAction } from "@/lib/aim-agent-guides"
import { buildAimDeliveryContract, type AimDeliveryContract } from "@/lib/aim-delivery-contract"
import { KNOWLEDGE_STRATEGY_PROFILES } from "@/lib/aim-knowledge-strategy"
import { reportAimRunEvent } from "@/lib/aim/run-events"
import {
  AIM_FORMAT_LABELS,
  AIM_SOFT_ACTION_CLASS,
  AIM_WORKFLOW_STATUS_OPTIONS,
  splitAimMethodNote,
} from "@/lib/aim/workbench-display"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { AimContentAction, AimWorkflowStage } from "@/lib/aim-workflow"
import type { AimGenerateResponse, AimGenerateResult, ContentFormat } from "@/lib/api/client"

export interface AimDeliverableBubbleProps {
  deliverables: AimGenerateResponse
  runId?: string | null
  isCurrentVersion: boolean
  agentId: AimAgentId
  workflowStage?: AimWorkflowStage
  contentAction?: AimContentAction | null
  nextActions?: AimNextAction[]
  onRepurpose: (format: ContentFormat) => void
  onQuality: () => void
  onMarkStatus: (status: string) => void
  onNextAction?: (action: AimNextAction, content: string, generationId: string) => void
  isBusy: boolean
  onEditResult?: (format: ContentFormat, content: string) => void
  onCompileToWiki?: () => void
  onOpenDecision?: () => void
  onOpenPublish?: () => void
  onOpenRetro?: () => void
}

const ZhuJianContent = memo(function ZhuJianContent({ text }: { text: string }) {
  const lines = useMemo(() => (text ? text.split("\n") : []), [text])
  return <div className="space-y-3 select-text font-serif leading-loose tracking-wider text-foreground/95 antialiased">
    {lines.map((line, index) => {
      const parts = line.replace(/\*\*/g, "").split(/(【[^】]+】)/g)
      return <p key={index} className="my-2 min-h-6 text-sm leading-loose text-[#2c2b2a] dark:text-[#f3ede2] sm:text-base">
        {parts.map((part, partIndex) => {
          if (!part.startsWith("【") || !part.endsWith("】")) return <span key={partIndex}>{part}</span>
          const style = part === "【画面】"
            ? "bamboo-scene-tag"
            : part === "【旁白】"
              ? "gold-ink-narration border border-amber-700/20 dark:border-amber-500/20"
              : "badge-gold border border-primary/30"
          return <span key={partIndex} className={`mx-1 inline-block rounded-xs px-2 py-0.5 text-xs font-serif font-bold ${style}`}>{part}</span>
        })}
      </p>
    })}
  </div>
})

export function DeliveryContractStrip({ contract }: { contract: AimDeliveryContract }) {
  const toneClass = {
    success: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-red-700 dark:text-red-400",
    neutral: "text-foreground",
  }[contract.status.tone]
  const items = [
    { label: "任务", value: contract.task.label, detail: contract.task.detail, icon: Target, className: "text-foreground" },
    { label: "依据", value: contract.evidence.label, detail: contract.evidence.detail, icon: Database, className: "text-foreground" },
    { label: "状态", value: contract.status.label, detail: contract.status.detail, icon: ShieldCheck, className: toneClass },
    { label: "下一步", value: contract.next.label, detail: contract.next.detail, icon: ArrowRight, className: "text-foreground" },
  ]
  return <div className="mb-4 border-y border-border/70 bg-muted/20">
    <div className="grid grid-cols-2 lg:grid-cols-4">{items.map(({ label, value, detail, icon: Icon, className }, index) =>
      <div key={label} className={`min-w-0 px-3 py-2.5 ${index % 2 === 1 ? "border-l border-border/60" : ""} ${index > 1 ? "border-t border-border/60 lg:border-t-0" : ""} ${index === 2 ? "lg:border-l" : ""}`} title={detail}>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="h-3 w-3 shrink-0" /><span>{label}</span></div>
        <p className={`mt-1 truncate text-xs font-medium ${className}`}>{value}</p>
        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{detail}</p>
      </div>)}</div>
    {contract.expanded ? <div className="border-t border-border/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
      {contract.taskSpec?.mode === "discovery_exploration" ? <p className="text-amber-600 dark:text-amber-400">当前信息不足，无法给出确定方案；请先补充关键资料，再生成正式方案。</p> : null}
      {contract.assumptions?.length ? <p className="mt-1"><span className="font-medium text-foreground">本次假设：</span>{contract.assumptions.map((item) => `${item.statement}（影响${item.impact}）`).join("；")}</p> : null}
      {contract.unknowns?.length ? <p className="mt-1"><span className="font-medium text-foreground">待确认：</span>{contract.unknowns.join("；")}</p> : null}
      {contract.knownFacts?.length ? <p className="mt-1"><span className="font-medium text-foreground">已知事实：</span>{contract.knownFacts.map((item) => item.statement).join("；")}</p> : null}
    </div> : null}
  </div>
}

function DeliverableResult({ item, copied, onCopy, onEdit }: {
  item: AimGenerateResult
  copied: boolean
  onCopy: (item: AimGenerateResult) => void
  onEdit?: (format: ContentFormat, content: string) => void
}) {
  const display = splitAimMethodNote(item.content)
  return <TabsContent value={item.format} className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">{AIM_FORMAT_LABELS[item.format]} · {item.wordCount} 字</span>
      <div className="flex items-center gap-1.5">
        {onEdit ? <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={() => onEdit(item.format, item.content)}>编辑</Button> : null}
        <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={() => onCopy(item)}>
          {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Clipboard className="mr-1 h-3.5 w-3.5" />}复制
        </Button>
      </div>
    </div>
    {display.methodNote ? <details className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none font-medium text-foreground/70">思考依据</summary>
      <div className="mt-2 border-t border-border/60 pt-2"><MarkdownRenderer content={display.methodNote} /></div>
    </details> : null}
    <div className="py-1">{item.format === "video_script" ? <ZhuJianContent text={display.result} /> : <MarkdownRenderer content={display.result} />}</div>
  </TabsContent>
}

function DeliverableTabs({ results, activeFormat, copiedFormat, onTabChange, onCopy, onEdit }: {
  results: AimGenerateResult[]
  activeFormat: ContentFormat
  copiedFormat: string | null
  onTabChange: (format: ContentFormat) => void
  onCopy: (item: AimGenerateResult) => void
  onEdit?: (format: ContentFormat, content: string) => void
}) {
  return <Tabs value={activeFormat} onValueChange={(value) => onTabChange(value as ContentFormat)} className="w-full">
    <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1 rounded-none bg-transparent p-0">
      {results.map((item) => <TabsTrigger key={item.format} value={item.format} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none">{AIM_FORMAT_LABELS[item.format]}</TabsTrigger>)}
    </TabsList>
    {results.map((item) => <DeliverableResult key={item.format} item={item} copied={copiedFormat === item.format} onCopy={onCopy} onEdit={onEdit} />)}
  </Tabs>
}

interface DeliverableActionsProps extends Pick<AimDeliverableBubbleProps, "deliverables" | "agentId" | "nextActions" | "onRepurpose" | "onQuality" | "onMarkStatus" | "onNextAction" | "onCompileToWiki" | "onOpenDecision" | "onOpenPublish" | "onOpenRetro" | "isBusy"> {
  activeResult?: AimGenerateResult
}

function PrimaryActions({ primaryActions, activeResult, deliverables, hasPublishScript, isBusy, onQuality, onNextAction }: {
  primaryActions: AimNextAction[]
  activeResult?: AimGenerateResult
  deliverables: AimGenerateResponse
  hasPublishScript: boolean
  isBusy: boolean
  onQuality: () => void
  onNextAction?: AimDeliverableBubbleProps["onNextAction"]
}) {
  return <>{primaryActions.map((action) => <Button key={action.id} size="sm" variant={action.id === "publish_package" ? "default" : "ghost"} className={action.id === "publish_package" ? "h-7 rounded-md px-2 text-xs" : AIM_SOFT_ACTION_CLASS} onClick={() => {
    if (action.id === "publish_check") return onQuality()
    if (activeResult) onNextAction?.(action, activeResult.content, deliverables.id)
  }} disabled={isBusy || !activeResult?.content.trim() || (action.id === "publish_check" && !hasPublishScript)}>
    {action.id === "publish_check" ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : null}{action.label}
  </Button>)}</>
}

function MoreActions({ formats, secondaryActions, activeResult, deliverables, isBusy, onRepurpose, onNextAction, onCompileToWiki }: {
  formats: Set<ContentFormat>
  secondaryActions: AimNextAction[]
  activeResult?: AimGenerateResult
  deliverables: AimGenerateResponse
  isBusy: boolean
  onRepurpose: (format: ContentFormat) => void
  onNextAction?: AimDeliverableBubbleProps["onNextAction"]
  onCompileToWiki?: () => void
}) {
  const hasVideo = formats.has("video_script")
  const options: Array<[ContentFormat, string]> = [
    ["koubo_script", "口播文案"], ["xiaohongshu_post", "小红书图文"], ["shooting_brief", "拍摄交接单"],
    ["moments_post", "朋友圈文案"], ["community_message", "社群运营"], ["wechat_article", "公众号文章"],
  ]
  const visibleOptions = hasVideo ? options.filter(([format]) => !formats.has(format)) : []
  const handleAction = (value: string | null) => {
    if (!value) return
    if (value.startsWith("format:")) return onRepurpose(value.replace("format:", "") as ContentFormat)
    if (value === "compile_wiki") return onCompileToWiki?.()
    const action = secondaryActions.find((item) => `action:${item.id}` === value)
    if (action && activeResult) onNextAction?.(action, activeResult.content, deliverables.id)
  }
  return <Select onValueChange={handleAction} disabled={isBusy || (!visibleOptions.length && !onCompileToWiki && !secondaryActions.length)}>
    <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted"><SelectValue placeholder="更多" /></SelectTrigger>
    <SelectContent>
      {visibleOptions.map(([format, label]) => <SelectItem key={format} value={`format:${format}`}>{label}</SelectItem>)}
      {onCompileToWiki ? <SelectItem value="compile_wiki">编译进 IP 维基</SelectItem> : null}
      {secondaryActions.map((action) => <SelectItem key={action.id} value={`action:${action.id}`} disabled={!activeResult?.content.trim()}>{action.label}</SelectItem>)}
    </SelectContent>
  </Select>
}

function DeliverableActions(props: DeliverableActionsProps) {
  const { deliverables, agentId, nextActions = [], activeResult, isBusy } = props
  const formats = new Set(deliverables.results.map((item) => item.format))
  const hasPublishScript = formats.has("video_script") || formats.has("koubo_script")
  const canRunPublishCheck = ["content_producer", "free_copywriter", "deep_copywriter", "content_review"].includes(agentId)
  const primaryActions = nextActions.filter((action) => action.id === "publish_package" || action.id === "publish_check")
  const secondaryActions = nextActions.filter((action) => action.id !== "publish_package" && action.id !== "publish_check")
  return <ActionStrip>
    <PrimaryActions primaryActions={primaryActions} activeResult={activeResult} deliverables={deliverables} hasPublishScript={hasPublishScript} isBusy={isBusy} onQuality={props.onQuality} onNextAction={props.onNextAction} />
    {canRunPublishCheck && !nextActions.some((action) => action.id === "publish_check") ? <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={props.onQuality} disabled={isBusy || !hasPublishScript}><ShieldCheck className="mr-1 h-3.5 w-3.5" />发布前自查</Button> : null}
    <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={props.onOpenDecision} disabled={isBusy}>发布前判断</Button>
    <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={props.onOpenPublish} disabled={isBusy}>登记发布</Button>
    <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={props.onOpenRetro} disabled={isBusy}>填写复盘</Button>
    <MoreActions formats={formats} secondaryActions={secondaryActions} activeResult={activeResult} deliverables={deliverables} isBusy={isBusy} onRepurpose={props.onRepurpose} onNextAction={props.onNextAction} onCompileToWiki={props.onCompileToWiki} />
    <Select onValueChange={(value) => { if (typeof value === "string") props.onMarkStatus(value) }}>
      <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted"><SelectValue placeholder="状态" /></SelectTrigger>
      <SelectContent>{AIM_WORKFLOW_STATUS_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  </ActionStrip>
}

export function AimDeliverableBubble(props: AimDeliverableBubbleProps) {
  const { deliverables, workflowStage, contentAction } = props
  const [activeTab, setActiveTab] = useState<ContentFormat>(deliverables.results[0]?.format || "raw_copy")
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const activeFormat = deliverables.results.some((item) => item.format === activeTab) ? activeTab : deliverables.results[0]?.format || "raw_copy"
  const activeResult = deliverables.results.find((item) => item.format === activeFormat) || deliverables.results[0]
  const primaryAction = props.nextActions?.find((action) => action.id === "publish_package" || action.id === "publish_check")
  const knowledgeStrategyLabel = deliverables.knowledgeStrategy
    ? KNOWLEDGE_STRATEGY_PROFILES[deliverables.knowledgeStrategy as keyof typeof KNOWLEDGE_STRATEGY_PROFILES]?.label ?? deliverables.knowledgeStrategy
    : undefined
  const contract = buildAimDeliveryContract({
    conversationMode: deliverables.conversationMode,
    knowledgeCount: deliverables.knowledgeUsed?.length ?? 0,
    knowledgeTitles: deliverables.knowledgeUsed?.map((item) => item.title),
    knowledgeStrategyLabel,
    degraded: deliverables.degraded,
    qualityStatus: deliverables.qualityStatus,
    isCurrentVersion: props.isCurrentVersion,
    primaryNextActionLabel: primaryAction?.label,
    taskSpec: deliverables.taskSpec ?? null,
  })
  const copyResult = async (item: AimGenerateResult) => {
    await navigator.clipboard.writeText(item.content)
    setCopiedFormat(item.format)
    setTimeout(() => setCopiedFormat(null), 600)
    reportAimRunEvent(props.runId, "copied", { format: item.format, ...(workflowStage ? { workflowStage } : {}), ...(contentAction ? { contentAction } : {}) })
    toast.success("已复制")
  }
  return <div className="mt-2 w-full"><AiResultPanel title="AI 交付物" icon={<Sparkles className="h-4 w-4 animate-pulse text-primary" />} meta={<Badge variant={props.isCurrentVersion ? "secondary" : "outline"} className="text-[10px]">{props.isCurrentVersion ? "当前版本" : "历史版本"}</Badge>} flat>
    <DeliveryContractStrip contract={contract} />
    <DeliverableTabs results={deliverables.results} activeFormat={activeFormat} copiedFormat={copiedFormat} onTabChange={setActiveTab} onCopy={copyResult} onEdit={props.onEditResult} />
    <DeliverableActions {...props} activeResult={activeResult} />
  </AiResultPanel></div>
}
