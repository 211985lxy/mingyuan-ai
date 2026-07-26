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
import { CanonicalContentPanel } from "@/components/aim/canonical-content-panel"
import { ContentPackagePanel } from "@/components/aim/content-package-panel"
import { KnowledgeCitationPanel } from "@/components/aim/knowledge-citation-panel"
import { PublishPackActions } from "@/components/aim/publish-pack-actions"
import type { TaskSpec } from "@/lib/task-spec"
import {
  getAllowedWorkflowTransitions,
  normalizeAimWorkflowStatus,
  type AimWorkflowStatus,
} from "@/lib/aim/workflow-status"

export interface AimDeliverableBubbleProps {
  messageId: string
  deliverables: AimGenerateResponse
  runId?: string | null
  isCurrentVersion: boolean
  agentId: AimAgentId
  workflowStage?: AimWorkflowStage
  contentAction?: AimContentAction | null
  nextActions?: AimNextAction[]
  onRepurpose: (formats: ContentFormat | ContentFormat[]) => void
  onQuality: () => void
  onMarkStatus: (status: string) => void
  onNextAction?: (action: AimNextAction, content: string, generationId: string) => void
  isBusy: boolean
  /** 重新生成中：旧稿变淡并显示进度条 */
  regenerating?: boolean
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
  onCanonicalUpdated?: (input: { generationId: string; taskSpec: TaskSpec }) => void
}

const ZhuJianContent = memo(function ZhuJianContent({ text }: { text: string }) {
  const paragraphs = useMemo(() => {
    const normalized = String(text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    if (!normalized) return [] as string[]
    // 只按空行分段；段内软换行保留，避免「一句一个大段距」
    return normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean)
  }, [text])
  return (
    <div className="space-y-2 select-text font-serif leading-7 tracking-wide text-foreground/95 antialiased">
      {paragraphs.map((paragraph, index) => {
        const parts = paragraph.replace(/\*\*/g, "").split(/(【[^】]+】)/g)
        return (
          <p
            key={index}
            className="whitespace-pre-line text-base leading-7 text-[#2c2b2a] dark:text-[#f3ede2] sm:text-[1.05rem]"
          >
            {parts.map((part, partIndex) => {
              if (!part.startsWith("【") || !part.endsWith("】")) {
                return <span key={partIndex}>{part}</span>
              }
              const style = part === "【画面】"
                ? "bamboo-scene-tag"
                : part === "【旁白】"
                  ? "gold-ink-narration border border-amber-700/20 dark:border-amber-500/20"
                  : "badge-gold border border-primary/30"
              return (
                <span
                  key={partIndex}
                  className={`mx-1 inline-block rounded-xs px-2 py-0.5 text-sm font-serif font-bold ${style}`}
                >
                  {part}
                </span>
              )
            })}
          </p>
        )
      })}
    </div>
  )
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
  const hasExpanded =
    contract.expanded &&
    (contract.taskSpec?.mode === "discovery_exploration" ||
      Boolean(contract.assumptions?.length) ||
      Boolean(contract.unknowns?.length) ||
      Boolean(contract.knownFacts?.length))

  return (
    <div className="border-b border-border/60 pb-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {items.map(({ label, value, detail, icon: Icon, className }) => (
          <span key={label} className="inline-flex min-w-0 max-w-full items-center gap-1" title={detail}>
            <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">{label}</span>
            <span className={`truncate font-medium ${className}`}>{value}</span>
            <span className="hidden truncate text-muted-foreground sm:inline">{detail}</span>
          </span>
        ))}
      </div>
      {hasExpanded ? (
        <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
          {contract.taskSpec?.mode === "discovery_exploration" ? (
            <p className="text-amber-600 dark:text-amber-400">
              当前信息不足，无法给出确定方案；请先补充关键资料，再生成正式方案。
            </p>
          ) : null}
          {contract.assumptions?.length ? (
            <p>
              <span className="font-medium text-foreground">本次假设：</span>
              {contract.assumptions.map((item) => `${item.statement}（影响${item.impact}）`).join("；")}
            </p>
          ) : null}
          {contract.unknowns?.length ? (
            <p>
              <span className="font-medium text-foreground">待确认：</span>
              {contract.unknowns.join("；")}
            </p>
          ) : null}
          {contract.knownFacts?.length ? (
            <p>
              <span className="font-medium text-foreground">已知事实：</span>
              {contract.knownFacts.map((item) => item.statement).join("；")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function DeliverableResult({ item, generationId, messageKey, inlineEditKey, onInlineEditKeyChange, onInlineContentSaved, onInlineSelectionRewrite, referenceText, persona, topicTitle, projectId }: {
  item: AimGenerateResult
  generationId: string
  messageKey: string
  inlineEditKey?: string | null
  onInlineEditKeyChange?: (key: string | null) => void
  onInlineContentSaved?: (format: ContentFormat, content: string) => void
  onInlineSelectionRewrite?: AimDeliverableBubbleProps["onInlineSelectionRewrite"]
  referenceText?: string
  persona?: string
  topicTitle?: string
  projectId?: string
}) {
  const display = splitAimMethodNote(item.content)
  const sessionKey = `${messageKey}:${item.format}`
  return <TabsContent value={item.format} className="space-y-3">
    {display.methodNote ? <details className="rounded-md border border-border bg-muted/25 px-3 py-2.5 text-sm text-muted-foreground">
      <summary className="cursor-pointer select-none font-medium text-foreground/80">思考依据</summary>
      <div className="mt-2 border-t border-border/60 pt-2"><MarkdownRenderer content={display.methodNote} /></div>
    </details> : null}
    <AimInlineDocumentCard
      messageId={messageKey}
      generationId={generationId}
      format={item.format}
      content={display.result}
      renderView={(text) =>
        item.format === "video_script" || item.format === "koubo_script"
          ? <ZhuJianContent text={text} />
          : <MarkdownRenderer content={text} />
      }
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
      onSelectionRewrite={(input) => onInlineSelectionRewrite?.({ format: item.format, ...input })}
      referenceText={referenceText}
      persona={persona}
      topicTitle={topicTitle}
      projectId={projectId}
    />
  </TabsContent>
}

function DeliverableTabs({ results, activeFormat, onTabChange, generationId, messageKey, inlineEditKey, onInlineEditKeyChange, onInlineContentSaved, onInlineSelectionRewrite, referenceText, persona, topicTitle, projectId }: {
  results: AimGenerateResult[]
  activeFormat: ContentFormat
  onTabChange: (format: ContentFormat) => void
  generationId: string
  messageKey: string
  inlineEditKey?: string | null
  onInlineEditKeyChange?: (key: string | null) => void
  onInlineContentSaved?: (format: ContentFormat, content: string) => void
  onInlineSelectionRewrite?: AimDeliverableBubbleProps["onInlineSelectionRewrite"]
  referenceText?: string
  persona?: string
  topicTitle?: string
  projectId?: string
}) {
  return <Tabs value={activeFormat} onValueChange={(value) => onTabChange(value as ContentFormat)} className="w-full">
    <TabsList className="mb-2 flex h-auto flex-wrap justify-start gap-1 rounded-none bg-transparent p-0">
      {results.map((item) => <TabsTrigger key={item.format} value={item.format} className="rounded-md px-2.5 py-1 text-xs text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none">{AIM_FORMAT_LABELS[item.format]}</TabsTrigger>)}
    </TabsList>
    {results.map((item) => <DeliverableResult key={item.format} item={item} generationId={generationId} messageKey={messageKey} inlineEditKey={inlineEditKey} onInlineEditKeyChange={onInlineEditKeyChange} onInlineContentSaved={onInlineContentSaved} onInlineSelectionRewrite={onInlineSelectionRewrite} referenceText={referenceText} persona={persona} topicTitle={topicTitle} projectId={projectId} />)}
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
  return <>{primaryActions.map((action) => <Button key={action.id} size="sm" variant={action.id === "publish_package" ? "default" : "ghost"} className={action.id === "publish_package" ? "h-7 shrink-0 rounded-md px-2.5 text-xs" : AIM_SOFT_ACTION_CLASS} onClick={() => {
    if (action.id === "publish_check") return onQuality()
    if (activeResult) onNextAction?.(action, activeResult.content, deliverables.id)
  }} disabled={isBusy || !activeResult?.content.trim() || (action.id === "publish_check" && !hasPublishScript)}>
    {action.id === "publish_check" ? <ShieldCheck className="mr-1 h-3.5 w-3.5" /> : null}{action.label}
  </Button>)}</>
}

function MoreActions({ formats, secondaryActions, workflowExtras, activeResult, deliverables, isBusy, onRepurpose, onNextAction, onCompileToWiki, onAttachProject, onQuality, canRunPublishCheck, hasPublishScript, hasPublishCheckAction }: {
  formats: Set<ContentFormat>
  secondaryActions: AimNextAction[]
  workflowExtras: Array<{ id: string; label: string; disabled?: boolean; onSelect: () => void }>
  activeResult?: AimGenerateResult
  deliverables: AimGenerateResponse
  isBusy: boolean
  onRepurpose: (formats: ContentFormat | ContentFormat[]) => void
  onNextAction?: AimDeliverableBubbleProps["onNextAction"]
  onCompileToWiki?: () => void
  onAttachProject?: (generationId: string) => void
  onQuality?: () => void
  canRunPublishCheck: boolean
  hasPublishScript: boolean
  hasPublishCheckAction: boolean
}) {
  const hasVideo = formats.has("video_script") || formats.has("koubo_script")
  const options: Array<[ContentFormat, string]> = [
    ["xiaohongshu_post", "小红书图文"], ["shooting_brief", "拍摄交接单"],
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
    if (value.startsWith("workflow:")) {
      const extra = workflowExtras.find((item) => `workflow:${item.id}` === value)
      return extra?.onSelect()
    }
    const action = secondaryActions.find((item) => `action:${item.id}` === value)
    if (action && activeResult) onNextAction?.(action, activeResult.content, deliverables.id)
  }
  const hasWorkflow = Boolean(onAttachProject) || showPublishCheck || workflowExtras.length > 0
  const disabled = isBusy || (!hasWorkflow && !visibleOptions.length && !onCompileToWiki && !secondaryActions.length)
  return <Select onValueChange={handleAction} disabled={disabled}>
    <SelectTrigger className="h-7 w-[72px] shrink-0 border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted"><SelectValue placeholder="更多" /></SelectTrigger>
    <SelectContent>
      {workflowExtras.map((item) => (
        <SelectItem key={item.id} value={`workflow:${item.id}`} disabled={item.disabled}>{item.label}</SelectItem>
      ))}
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
  const canRunPublishCheck = ["content_producer", "free_copywriter", "work_editor", "content_review"].includes(agentId)
  const primaryActions = nextActions.filter((action) => action.id === "publish_package" || action.id === "publish_check")
  const secondaryActions = nextActions.filter((action) => action.id !== "publish_package" && action.id !== "publish_check")
  const hasPublishCheckAction = nextActions.some((action) => action.id === "publish_check")
  const currentStatus = normalizeAimWorkflowStatus(deliverables.workflowStatus)
  const allowedStatuses = new Set<AimWorkflowStatus>([
    currentStatus,
    ...getAllowedWorkflowTransitions(currentStatus),
  ])
  const statusOptions = AIM_WORKFLOW_STATUS_OPTIONS.filter((item) =>
    allowedStatuses.has(item.value as AimWorkflowStatus),
  )
  const workflowExtras = [
    props.onOpenDecision ? { id: "decision", label: "发布前判断", onSelect: () => props.onOpenDecision?.() } : null,
    props.onOpenPublish ? { id: "publish", label: "登记发布", disabled: qualityFail, onSelect: () => props.onOpenPublish?.() } : null,
    props.onOpenRetro ? { id: "retro", label: "填写复盘", onSelect: () => props.onOpenRetro?.() } : null,
  ].filter((item): item is { id: string; label: string; disabled?: boolean; onSelect: () => void } => Boolean(item))

  return <ActionStrip>
    {qualityFail ? <Button size="sm" className="h-7 shrink-0 rounded-md px-2.5 text-xs" onClick={props.onQuality} disabled={isBusy}><ShieldCheck className="mr-1 h-3.5 w-3.5" />优化后再用</Button> : <PrimaryActions primaryActions={primaryActions} activeResult={activeResult} deliverables={deliverables} hasPublishScript={hasPublishScript} isBusy={isBusy} onQuality={props.onQuality} onNextAction={props.onNextAction} />}
    <Select
      value={currentStatus}
      onValueChange={(value) => { if (typeof value === "string") props.onMarkStatus(value) }}
    >
      <SelectTrigger className="h-7 w-[76px] shrink-0 border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted"><SelectValue placeholder="状态" /></SelectTrigger>
      <SelectContent>
        {statusOptions.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
    <MoreActions
      formats={formats}
      secondaryActions={secondaryActions}
      workflowExtras={workflowExtras}
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
        <p className="text-xs text-muted-foreground">正在重出一版…</p>
      </div>
    ) : null}
    <AiResultPanel
      title="AI 交付物"
      icon={<Sparkles className="h-3.5 w-3.5 text-primary" />}
      meta={<Badge variant={props.isCurrentVersion ? "secondary" : "outline"} className="text-[10px]">{props.isCurrentVersion ? "当前版本" : "历史版本"}</Badge>}
      flat
      contentClassName="py-0"
    >
      {/* 文案优先：正文置顶，元信息默认折叠，把垂直空间还给内容 */}
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
        referenceText={props.referenceText}
        persona={props.persona}
        topicTitle={props.topicTitle}
        projectId={props.projectId}
      />
      <div className="mt-2 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto border-t border-border/50 pt-2">
        <DeliverableActions {...props} isBusy={actionsBusy} activeResult={activeResult} />
        <PublishPackActions
          deliverables={deliverables}
          projectId={deliverables.projectId}
          publishPlatform={deliverables.publishPlatform}
          publishUrl={deliverables.publishUrl}
          reviewNote={deliverables.reviewNote}
        />
      </div>
      <details className="mt-2 rounded-md border border-border/60 bg-muted/15 open:bg-muted/20">
        <summary className="cursor-pointer select-none px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          交付依据与衍生工具
        </summary>
        <div className="space-y-2 border-t border-border/50 px-2.5 py-2">
          <DeliveryContractStrip contract={contract} />
          <KnowledgeCitationPanel knowledgeUsed={deliverables.knowledgeUsed} compact />
          {deliverables.id && deliverables.taskSpec ? (
            <CanonicalContentPanel
              generationId={deliverables.id}
              taskSpec={deliverables.taskSpec}
              knowledgeUsed={deliverables.knowledgeUsed}
              onUpdated={({ taskSpec }) => {
                props.onCanonicalUpdated?.({ generationId: deliverables.id, taskSpec })
              }}
            />
          ) : null}
          <ContentPackagePanel
            deliverables={deliverables}
            isBusy={actionsBusy}
            onGeneratePackage={(formats) => props.onRepurpose(formats)}
          />
        </div>
      </details>
    </AiResultPanel>
  </div>
}
