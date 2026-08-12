"use client"

import { memo, useMemo, useState } from "react"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { AimNextAction } from "@/lib/aim-agent-guides"
import { AIM_FORMAT_LABELS, splitAimMethodNote } from "@/lib/aim/workbench-display"
import { SAFETY_WARNING_MARKER } from "@/lib/aim-content-creation-trace"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { AimContentAction, AimWorkflowStage } from "@/lib/aim-workflow"
import type { AimGenerateResponse, AimGenerateResult, ContentFormat } from "@/lib/api/client"
import { AimInlineDocumentCard } from "@/components/aim/aim-inline-document-card"
import type { TextSelectionRange } from "@/lib/aim-editor"
import type { TaskSpec } from "@/lib/task-spec"

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
  // 安全闸门末次命中时，风险提示被注入 METHOD_NOTE；这里把它提取为非折叠横幅，
  // 避免发布前必须核实的风险被埋在默认折叠的「思考依据」里。
  const noteLines = display.methodNote ? display.methodNote.split("\n") : []
  const safetyWarningLine = noteLines.find((line) => line.trim().startsWith(SAFETY_WARNING_MARKER))
  const safetyWarning = safetyWarningLine ? safetyWarningLine.trim().slice(SAFETY_WARNING_MARKER.length).trim() : undefined
  const methodNote = safetyWarning
    ? noteLines.filter((line) => !line.trim().startsWith(SAFETY_WARNING_MARKER)).join("\n").replace(/^\n+/, "").trim()
    : display.methodNote
  return <TabsContent value={item.format} className="space-y-3">
    {safetyWarning ? <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="font-medium">⚠ 本版仍检出风险，发布前请人工核实</span>：{safetyWarning}
    </div> : null}
    {methodNote ? <details className="rounded-md border border-border bg-muted/25 px-3 py-2.5 text-sm text-muted-foreground">
      <summary className="cursor-pointer select-none font-medium text-foreground/80">思考依据</summary>
      <div className="mt-2 border-t border-border/60 pt-2"><MarkdownRenderer content={methodNote} /></div>
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
    {results.length > 1 ? (
      <TabsList className="mb-2 flex h-auto flex-wrap justify-start gap-1 rounded-none bg-transparent p-0">
        {results.map((item) => <TabsTrigger key={item.format} value={item.format} className="rounded-md px-2.5 py-1 text-xs text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none">{AIM_FORMAT_LABELS[item.format]}</TabsTrigger>)}
      </TabsList>
    ) : null}
    {results.map((item) => <DeliverableResult key={item.format} item={item} generationId={generationId} messageKey={messageKey} inlineEditKey={inlineEditKey} onInlineEditKeyChange={onInlineEditKeyChange} onInlineContentSaved={onInlineContentSaved} onInlineSelectionRewrite={onInlineSelectionRewrite} referenceText={referenceText} persona={persona} topicTitle={topicTitle} projectId={projectId} />)}
  </Tabs>
}

/**
 * @description aimdeliverablebubble
 * @param props - 组件属性
 * @returns 无返回值
 */
export function AimDeliverableBubble(props: AimDeliverableBubbleProps) {
  const { deliverables, regenerating = false } = props
  const [activeTab, setActiveTab] = useState<ContentFormat>(deliverables.results[0]?.format || "raw_copy")
  const activeFormat = deliverables.results.some((item) => item.format === activeTab) ? activeTab : deliverables.results[0]?.format || "raw_copy"
  return <div className={`mt-2 w-full transition-opacity duration-300 ${regenerating ? "opacity-55" : "opacity-100"}`}>
    {regenerating ? (
      <div className="mb-2 space-y-1.5" aria-live="polite">
        <div className="h-0.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/50" />
        </div>
        <p className="text-xs text-muted-foreground">正在重出一版…</p>
      </div>
    ) : null}
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
  </div>
}
