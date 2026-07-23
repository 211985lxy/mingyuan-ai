"use client"

import { memo, useMemo, useState } from "react"
import { ArrowRight, Database, ShieldCheck, Sparkles, Target } from "lucide-react"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { ActionStrip } from "@/components/workbench/action-strip"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AimNextAction } from "@/lib/aim-agent-guides"
import { buildAimDeliveryContract, type AimDeliveryContract } from "@/lib/aim-delivery-contract"
import { resolveAimTurnIntent } from "@/lib/aim-turn-intent"
import { KNOWLEDGE_STRATEGY_PROFILES } from "@/lib/aim-knowledge-strategy"
import {
  AIM_FORMAT_LABELS,
  AIM_SOFT_ACTION_CLASS,
  AIM_WORKFLOW_STATUS_OPTIONS,
  splitAimMethodNote,
} from "@/lib/aim/workbench-display"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { AimContentAction, AimWorkflowStage } from "@/lib/aim-workflow"
import type { AimGenerateResponse, AimGenerateResult, ContentFormat } from "@/lib/api/client"
import { AimInlineDocumentCard } from "@/components/aim/aim-inline-document-card"
import type { TextSelectionRange } from "@/lib/aim-editor"

export interface AimDeliverableBubbleProps {
  messageId: string
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
  /** 重新生成中：旧稿变淡并显示进度条 */
  regenerating?: boolean
  onEditResult?: (format: ContentFormat, content: string) => void
  onCompileToWiki?: () => void
  onOpenDecision?: () => void
  onOpenPublish?: () => void
  onOpenRetro?: () => void
  onAttachProject?: (generationId: string) => void
  /** 内联编辑会话：当前占用的 messageId:format */
  inlineEditKey?: string | null
  onInlineEditKeyChange?: (key: string | null) => void
  onInlineContentSaved?: (format: ContentFormat, content: string) => void
  onInlineSelectionRewrite?: (input: {
    format: ContentFormat
    prompt: string
    selectionText: string
    range: TextSelectionRange
    draftContent: string
  }) => void
  referenceText?: string
  persona?: string
  topicTitle?: string
  projectId?: string
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

/**
 * @description deliverycontractstrip
 * @param options - 配置选项
 * @returns 无返回值
 */
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

function DeliverableResult({ item, generationId, messageKey, inlineEditKey, onInlineEditKeyChange, onInlineContentSaved, onInlineSelectionRewrite, onOpenAdvanced, referenceText, persona, topicTitle, projectId }: {
  item: AimGenerateResult
  generationId: string
  messageKey: string
  inlineEditKey?: string | null
  onInlineEditKeyChange?: (key: string | null) => void
  onInlineContentSaved?: (format: ContentFormat, content: string) => void
  onInlineSelectionRewrite?: AimDeliverableBubbleProps["onInlineSelectionRewrite"]
  onOpenAdvanced?: (format: ContentFormat, content: string) => void
  referenceText?: string
  persona?: string
  topicTitle?: string
  projectId?: string
}) {
  const display = splitAimMethodNote(item.content)
  const sessionKey = `${messageKey}:${item.format}`
  return <TabsContent value={item.format} className="space-y-3">
    {display.methodNote ? <details className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer select-none font-medium text-foreground/70">思考依据</summary>
      <div className="mt-2 border-t border-border/60 pt-2"><MarkdownRenderer content={display.methodNote} /></div>
    </details> : null}
    <AimInlineDocumentCard
      messageId={messageKey}
      generationId={generationId}
      format={item.format}
      content={display.result}
      renderView={(text) => item.format === "video_script" ? <ZhuJianContent text={text} /> : <MarkdownRenderer content={text} />}
      isSessionOwner={inlineEditKey === sessionKey}
      canStartEdit={!inlineEditKey || inlineEditKey === sessionKey}
      onRequestEditOwnership={() => {
        if (inlineEditKey && inlineEditKey !== sessionKey) return false
        onInlineEditKeyChange?.(sessionKey)
        return true
      }}
      onReleaseEditOwnership={() => {
        if (inlineEditKey === sessionKey) onInlineEditKeyChange?.(null)
      }}
      onContentSaved={(content) => {
        onInlineContentSaved?.(item.format, content)
      }}
      onOpenAdvanced={(content) => onOpenAdvanced?.(item.format, content)}
      onSelectionRewrite={(input) => onInlineSelectionRewrite?.({ format: item.format, ...input })}
      referenceText={referenceText}
      persona={persona}
      topicTitle={topicTitle}
      projectId={projectId}
    />
  </TabsContent>
}

function DeliverableTabs({ results, activeFormat, onTabChange, generationId, messageKey, inlineEditKey, onInlineEditKeyChange, onInlineContentSaved, onInlineSelectionRewrite, onOpenAdvanced, referenceText, persona, topicTitle, projectId }: {
  results: AimGenerateResult[]
  activeFormat: ContentFormat
  onTabChange: (format: ContentFormat) => void
  generationId: string
  messageKey: string
  inlineEditKey?: string | null
  onInlineEditKeyChange?: (key: string | null) => void
  onInlineContentSaved?: (format: ContentFormat, content: string) => void
  onInlineSelectionRewrite?: AimDeliverableBubbleProps["onInlineSelectionRewrite"]
  onOpenAdvanced?: (format: ContentFormat, content: string) => void
  referenceText?: string
  persona?: string
  topicTitle?: string
  projectId?: string
}) {
  return <Tabs value={activeFormat} onValueChange={(value) => onTabChange(value as ContentFormat)} className="w-full">
    <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1 rounded-none bg-transparent p-0">
      {results.map((item) => <TabsTrigger key={item.format} value={item.format} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none">{AIM_FORMAT_LABELS[item.format]}</TabsTrigger>)}
    </TabsList>
    {results.map((item) => <DeliverableResult key={item.format} item={item} generationId={generationId} messageKey={messageKey} inlineEditKey={inlineEditKey} onInlineEditKeyChange={onInlineEditKeyChange} onInlineContentSaved={onInlineContentSaved} onInlineSelectionRewrite={onInlineSelectionRewrite} onOpenAdvanced={onOpenAdvanced} referenceText={referenceText} persona={persona} topicTitle={topicTitle} projectId={projectId} />)}
  </Tabs>
}

interface DeliverableActionsProps extends Pick<AimDeliverableBubbleProps, "deliverables" | "agentId" | "nextActions" | "onRepurpose" | "onQuality" | "onMarkStatus" | "onNextAction" | "onCompileToWiki" | "onOpenDecision" | "onOpenPublish" | "onOpenRetro" | "onAttachProject" | "isBusy"> {
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

function MoreActions({ formats, secondaryActions, activeResult, deliverables, isBusy, onRepurpose, onNextAction, onCompileToWiki, onAttachProject, onQuality, canRunPublishCheck, hasPublishScript, hasPublishCheckAction }: {
  formats: Set<ContentFormat>
  secondaryActions: AimNextAction[]
  activeResult?: AimGenerateResult
  deliverables: AimGenerateResponse
  isBusy: boolean
  onRepurpose: (format: ContentFormat) => void
  onNextAction?: AimDeliverableBubbleProps["onNextAction"]
  onCompileToWiki?: () => void
  onAttachProject?: (generationId: string) => void
  onQuality?: () => void
  canRunPublishCheck: boolean
  hasPublishScript: boolean
  hasPublishCheckAction: boolean
}) {
  const hasVideo = formats.has("video_script")
  const options: Array<[ContentFormat, string]> = [
    ["koubo_script", "口播文案"], ["xiaohongshu_post", "小红书图文"], ["shooting_brief", "拍摄交接单"],
    ["moments_post", "朋友圈文案"], ["community_message", "社群运营"], ["wechat_article", "公众号文章"],
  ]
  const visibleOptions = hasVideo ? options.filter(([format]) => !formats.has(format)) : []
  const showPublishCheck = canRunPublishCheck && !hasPublishCheckAction
  const handleAction = (value: string | null) => {
    if (!value) return
    if (value.startsWith("format:")) return onRepurpose(value.replace("format:", "") as ContentFormat)
    if (value === "compile_wiki") return onCompileToWiki?.()
    if (value === "save_project") return onAttachProject?.(deliverables.id)
    if (value === "publish_check") return onQuality?.()
    const action = secondaryActions.find((item) => `action:${item.id}` === value)
    if (action && activeResult) onNextAction?.(action, activeResult.content, deliverables.id)
  }
  const hasWorkflow = Boolean(onAttachProject) || showPublishCheck
  const disabled = isBusy || (!hasWorkflow && !visibleOptions.length && !onCompileToWiki && !secondaryActions.length)
  return <Select onValueChange={handleAction} disabled={disabled}>
    <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted"><SelectValue placeholder="更多" /></SelectTrigger>
    <SelectContent>
      {onAttachProject ? <SelectItem value="save_project">保存到客户全案</SelectItem> : null}
      {showPublishCheck ? <SelectItem value="publish_check" disabled={!hasPublishScript}>发布前自查</SelectItem> : null}
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
  const qualityFail = deliverables.qualityStatus === "fail"
  const canRunPublishCheck = ["content_producer", "free_copywriter", "deep_copywriter", "content_review"].includes(agentId)
  const primaryActions = nextActions.filter((action) => action.id === "publish_package" || action.id === "publish_check")
  const secondaryActions = nextActions.filter((action) => action.id !== "publish_package" && action.id !== "publish_check")
  const hasPublishCheckAction = nextActions.some((action) => action.id === "publish_check")
  return <ActionStrip>
    {qualityFail ? <Button size="sm" className="h-7 rounded-md px-2 text-xs" onClick={props.onQuality} disabled={isBusy}><ShieldCheck className="mr-1 h-3.5 w-3.5" />优化后再用</Button> : <PrimaryActions primaryActions={primaryActions} activeResult={activeResult} deliverables={deliverables} hasPublishScript={hasPublishScript} isBusy={isBusy} onQuality={props.onQuality} onNextAction={props.onNextAction} />}
    {props.onOpenDecision ? <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={props.onOpenDecision} disabled={isBusy}>发布前判断</Button> : null}
    {props.onOpenPublish ? <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={props.onOpenPublish} disabled={isBusy || qualityFail}>登记发布</Button> : null}
    {props.onOpenRetro ? <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={props.onOpenRetro} disabled={isBusy}>填写复盘</Button> : null}
    <MoreActions
      formats={formats}
      secondaryActions={secondaryActions}
      activeResult={activeResult}
      deliverables={deliverables}
      isBusy={isBusy}
      onRepurpose={props.onRepurpose}
      onNextAction={props.onNextAction}
      onCompileToWiki={props.onCompileToWiki}
      onAttachProject={props.onAttachProject}
      onQuality={props.onQuality}
      canRunPublishCheck={canRunPublishCheck}
      hasPublishScript={hasPublishScript}
      hasPublishCheckAction={hasPublishCheckAction}
    />
    <Select onValueChange={(value) => { if (typeof value === "string") props.onMarkStatus(value) }}>
      <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted"><SelectValue placeholder="状态" /></SelectTrigger>
      <SelectContent>{AIM_WORKFLOW_STATUS_OPTIONS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
    </Select>
  </ActionStrip>
}

/**
 * @description aimdeliverablebubble
 * @param props - 组件属性
 * @returns 无返回值
 */
export function AimDeliverableBubble(props: AimDeliverableBubbleProps) {
  const { deliverables, workflowStage, contentAction, regenerating = false } = props
  const actionsBusy = props.isBusy || regenerating
  const [activeTab, setActiveTab] = useState<ContentFormat>(deliverables.results[0]?.format || "raw_copy")
  const activeFormat = deliverables.results.some((item) => item.format === activeTab) ? activeTab : deliverables.results[0]?.format || "raw_copy"
  const activeResult = deliverables.results.find((item) => item.format === activeFormat) || deliverables.results[0]
  const primaryAction = props.nextActions?.find((action) => action.id === "publish_package" || action.id === "publish_check")
  const knowledgeStrategyLabel = deliverables.knowledgeStrategy
    ? KNOWLEDGE_STRATEGY_PROFILES[deliverables.knowledgeStrategy as keyof typeof KNOWLEDGE_STRATEGY_PROFILES]?.label ?? deliverables.knowledgeStrategy
    : undefined
  const turnIntent = resolveAimTurnIntent({
    rawInput: deliverables.taskSpec?.goal || deliverables.taskSpec?.coreMessage || "",
    runtimeTask: undefined,
    archive: {
      knowledgeCount: deliverables.knowledgeUsed?.length ?? 0,
    },
  })
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
    turnIntentSummary: turnIntent.summary,
    archiveGaps: turnIntent.archiveGaps,
  })
  return <div className={`mt-2 w-full transition-opacity duration-300 ${regenerating ? "opacity-55" : "opacity-100"}`}>
    {regenerating ? (
      <div className="mb-2 space-y-1.5" aria-live="polite">
        <div className="h-0.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/50" />
        </div>
        <p className="text-[11px] text-muted-foreground">正在重出一版…</p>
      </div>
    ) : null}
    <AiResultPanel title="AI 交付物" icon={<Sparkles className="h-4 w-4 text-primary" />} meta={<Badge variant={props.isCurrentVersion ? "secondary" : "outline"} className="text-[10px]">{props.isCurrentVersion ? "当前版本" : "历史版本"}</Badge>} flat>
      <DeliveryContractStrip contract={contract} />
      <DeliverableTabs
        results={deliverables.results}
        activeFormat={activeFormat}
        onTabChange={setActiveTab}
        generationId={deliverables.id}
        messageKey={props.messageId}
        inlineEditKey={regenerating ? null : props.inlineEditKey}
        onInlineEditKeyChange={props.onInlineEditKeyChange}
        onInlineContentSaved={props.onInlineContentSaved}
        onInlineSelectionRewrite={props.onInlineSelectionRewrite}
        onOpenAdvanced={regenerating ? undefined : props.onEditResult}
        referenceText={props.referenceText}
        persona={props.persona}
        topicTitle={props.topicTitle}
        projectId={props.projectId}
      />
      <DeliverableActions {...props} isBusy={actionsBusy} activeResult={activeResult} />
    </AiResultPanel>
  </div>
}
