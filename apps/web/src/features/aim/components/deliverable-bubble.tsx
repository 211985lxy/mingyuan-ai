"use client"

import { useMemo, useState, memo } from "react"
import { Check, Clipboard, ShieldCheck, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ActionStrip } from "@/components/workbench/action-strip"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { buildAimDeliveryContract } from "@/lib/aim-delivery-contract"
import { KNOWLEDGE_STRATEGY_PROFILES } from "@/lib/aim-knowledge-strategy"
import { recordAimRunEvent, type AimGenerateResponse, type ContentFormat } from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { AimContentAction, AimWorkflowStage } from "@/lib/aim-workflow"
import type { AimNextAction } from "@/lib/aim-agent-guides"
import { DeliveryContractStrip } from "@/features/aim/components/delivery-contract-strip"
import { FORMAT_LABELS, WORKFLOW_STATUS_OPTIONS } from "@/features/aim/aim-format-labels"

const SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-muted/45 px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"

function splitMethodNote(content: string) {
  const match = content.match(/\[\[AIM_METHOD_NOTE\]\]([\s\S]*?)\[\[\/AIM_METHOD_NOTE\]\]/)
  if (!match) return { methodNote: "", result: content }
  return {
    methodNote: match[1].trim(),
    result: content.replace(match[0], "").trim(),
  }
}

const ZhuJianContent = memo(function ZhuJianContent({ text }: { text: string }) {
  const lines = useMemo(() => (text ? text.split("\n") : []), [text])
  return (
    <div className="space-y-3 select-text font-serif leading-loose tracking-wider text-foreground/95 antialiased">
      {lines.map((line, index) => {
        const displayLine = line.replace(/\*\*/g, "")
        const parts = displayLine.split(/(【[^】]+】)/g)
        if (parts.length > 1) {
          return (
            <p key={index} className="text-sm sm:text-base leading-loose my-2 text-[#2c2b2a] dark:text-[#f3ede2]">
              {parts.map((part, pIdx) => {
                if (part.startsWith("【") && part.endsWith("】")) {
                  if (part === "【画面】") {
                    return (
                      <span key={pIdx} className="inline-block mx-1 px-2 py-0.5 rounded-xs text-xs font-serif font-bold bamboo-scene-tag">
                        {part}
                      </span>
                    )
                  }
                  if (part === "【旁白】") {
                    return (
                      <span key={pIdx} className="inline-block mx-1 px-2 py-0.5 rounded-xs text-xs font-serif font-bold gold-ink-narration border border-amber-700/20 dark:border-amber-500/20">
                        {part}
                      </span>
                    )
                  }
                  return (
                    <span key={pIdx} className="inline-block mx-1 px-2 py-0.5 rounded-xs text-xs font-serif font-bold badge-gold border border-primary/30">
                      {part}
                    </span>
                  )
                }
                return <span key={pIdx}>{part}</span>
              })}
            </p>
          )
        }
        return (
          <p key={index} className="text-sm sm:text-base leading-loose my-2 text-[#2c2b2a] dark:text-[#f3ede2] min-h-6">
            {displayLine}
          </p>
        )
      })}
    </div>
  )
})

export function DeliverableBubble({
  deliverables,
  runId,
  isCurrentVersion,
  agentId,
  workflowStage,
  contentAction,
  nextActions,
  onRepurpose,
  onQuality,
  onMarkStatus,
  onNextAction,
  isBusy,
  onEditResult,
  onCompileToWiki,
  onOpenDecision,
  onOpenPublish,
  onOpenRetro,
}: {
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
}) {
  const [activeTab, setActiveTab] = useState<ContentFormat>(deliverables.results[0]?.format || "raw_copy")
  const [copiedFormat, setCopiedFormat] = useState<string | null>(null)
  const activeFormat = deliverables.results.some((r) => r.format === activeTab)
    ? activeTab
    : deliverables.results[0]?.format || "raw_copy"
  const activeResult = deliverables.results.find((r) => r.format === activeFormat) || deliverables.results[0]

  async function copyText(content: string, format?: string) {
    await navigator.clipboard.writeText(content)
    if (format) {
      setCopiedFormat(format)
      setTimeout(() => setCopiedFormat(null), 600)
    }
    if (runId) {
      void recordAimRunEvent(runId, "copied", {
        ...(format ? { format } : {}),
        ...(workflowStage ? { workflowStage } : {}),
        ...(contentAction ? { contentAction } : {}),
      }).catch(() => undefined)
    }
    toast.success("已复制")
  }

  const hasMoments = deliverables.results.some((r) => r.format === "moments_post")
  const hasWechat = deliverables.results.some((r) => r.format === "wechat_article")
  const hasVideo = deliverables.results.some((r) => r.format === "video_script")
  const hasKoubo = deliverables.results.some((r) => r.format === "koubo_script")
  const hasPublishScript = hasVideo || hasKoubo
  const hasXiaohongshu = deliverables.results.some((r) => r.format === "xiaohongshu_post")
  const hasCommunity = deliverables.results.some((r) => r.format === "community_message")
  const hasShooting = deliverables.results.some((r) => r.format === "shooting_brief")
  const canRunPublishCheck = agentId === "content_producer" || agentId === "free_copywriter" || agentId === "deep_copywriter" || agentId === "content_review"
  const primaryNextActions = nextActions?.filter((action) => action.id === "publish_package" || action.id === "publish_check") ?? []
  const secondaryNextActions = nextActions?.filter((action) => action.id !== "publish_package" && action.id !== "publish_check") ?? []
  const hasMoreActions = Boolean(
    (!hasKoubo && hasVideo)
    || (!hasXiaohongshu && hasVideo)
    || (!hasShooting && hasVideo)
    || (!hasMoments && hasVideo)
    || (!hasCommunity && hasVideo)
    || (!hasWechat && hasVideo)
    || onCompileToWiki
    || secondaryNextActions.length > 0,
  )
  const knowledgeStrategyLabel = deliverables.knowledgeStrategy
    ? KNOWLEDGE_STRATEGY_PROFILES[deliverables.knowledgeStrategy as keyof typeof KNOWLEDGE_STRATEGY_PROFILES]?.label
      ?? deliverables.knowledgeStrategy
    : undefined
  const deliveryContract = buildAimDeliveryContract({
    conversationMode: deliverables.conversationMode,
    knowledgeCount: deliverables.knowledgeUsed?.length ?? 0,
    knowledgeTitles: deliverables.knowledgeUsed?.map((item) => item.title),
    knowledgeStrategyLabel,
    degraded: deliverables.degraded,
    qualityStatus: deliverables.qualityStatus,
    isCurrentVersion,
    primaryNextActionLabel: primaryNextActions[0]?.label,
    taskSpec: deliverables.taskSpec ?? null,
  })

  function runMoreAction(value: string | null) {
    if (!value) return
    if (value.startsWith("format:")) {
      onRepurpose(value.replace("format:", "") as ContentFormat)
      return
    }
    if (value === "compile_wiki") {
      onCompileToWiki?.()
      return
    }
    const action = secondaryNextActions.find((item) => `action:${item.id}` === value)
    if (action && activeResult) onNextAction?.(action, activeResult.content, deliverables.id)
  }

  return (
    <div className="mt-2 w-full">
      <AiResultPanel
        title="AI 交付物"
        icon={<Sparkles className="h-4 w-4 text-primary animate-pulse" />}
        meta={
          <Badge variant={isCurrentVersion ? "secondary" : "outline"} className="text-[10px]">
            {isCurrentVersion ? "当前版本" : "历史版本"}
          </Badge>
        }
        flat
      >
        <DeliveryContractStrip contract={deliveryContract} />
        <Tabs value={activeFormat} onValueChange={(v) => setActiveTab(v as ContentFormat)} className="w-full">
          <TabsList className="mb-3 flex h-auto flex-wrap justify-start gap-1 rounded-none bg-transparent p-0">
            {deliverables.results.map((item) => (
              <TabsTrigger key={item.format} value={item.format} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none">
                {FORMAT_LABELS[item.format]}
              </TabsTrigger>
            ))}
          </TabsList>
          {deliverables.results.map((item) => {
            const display = splitMethodNote(item.content)
            return (
              <TabsContent key={item.format} value={item.format} className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{FORMAT_LABELS[item.format]} · {item.wordCount} 字</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onEditResult && (
                      <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={() => onEditResult(item.format, item.content)}>
                        编辑
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={() => copyText(item.content, item.format)}>
                      {copiedFormat === item.format ? <Check className="h-3.5 w-3.5 mr-1" /> : <Clipboard className="h-3.5 w-3.5 mr-1" />}
                      复制
                    </Button>
                  </div>
                </div>
                {display.methodNote && (
                  <details className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none font-medium text-foreground/70">思考依据</summary>
                    <div className="mt-2 border-t border-border/60 pt-2">
                      <MarkdownRenderer content={display.methodNote} />
                    </div>
                  </details>
                )}
                <div className="py-1">
                  {item.format === "video_script" ? (
                    <ZhuJianContent text={display.result} />
                  ) : (
                    <MarkdownRenderer content={display.result} />
                  )}
                </div>
              </TabsContent>
            )
          })}
        </Tabs>

        <ActionStrip>
          {primaryNextActions.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={action.id === "publish_package" ? "default" : "ghost"}
              className={action.id === "publish_package" ? "h-7 rounded-md px-2 text-xs" : SOFT_ACTION_CLASS}
              onClick={() => {
                if (action.id === "publish_check") {
                  onQuality()
                  return
                }
                if (activeResult) onNextAction?.(action, activeResult.content, deliverables.id)
              }}
              disabled={isBusy || !activeResult?.content.trim() || (action.id === "publish_check" && !hasPublishScript)}
            >
              {action.id === "publish_check" && <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
              {action.label}
            </Button>
          ))}
          {canRunPublishCheck && !nextActions?.some((action) => action.id === "publish_check") && (
            <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onQuality} disabled={isBusy || !hasPublishScript}>
              <ShieldCheck className="h-3.5 w-3.5 mr-1" /> 发布前自查
            </Button>
          )}
          <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onOpenDecision} disabled={isBusy}>
            发布前判断
          </Button>
          <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onOpenPublish} disabled={isBusy}>
            登记发布
          </Button>
          <Button size="sm" variant="ghost" className={SOFT_ACTION_CLASS} onClick={onOpenRetro} disabled={isBusy}>
            填写复盘
          </Button>
          <Select onValueChange={runMoreAction} disabled={isBusy || !hasMoreActions}>
            <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted">
              <SelectValue placeholder="更多" />
            </SelectTrigger>
            <SelectContent>
              {!hasKoubo && hasVideo && <SelectItem value="format:koubo_script">口播文案</SelectItem>}
              {!hasXiaohongshu && hasVideo && <SelectItem value="format:xiaohongshu_post">小红书图文</SelectItem>}
              {!hasShooting && hasVideo && <SelectItem value="format:shooting_brief">拍摄交接单</SelectItem>}
              {!hasMoments && hasVideo && <SelectItem value="format:moments_post">朋友圈文案</SelectItem>}
              {!hasCommunity && hasVideo && <SelectItem value="format:community_message">社群运营</SelectItem>}
              {!hasWechat && hasVideo && <SelectItem value="format:wechat_article">公众号文章</SelectItem>}
              {onCompileToWiki && <SelectItem value="compile_wiki">编译进 IP 维基</SelectItem>}
              {secondaryNextActions.map((action) => (
                <SelectItem key={action.id} value={`action:${action.id}`} disabled={!activeResult?.content.trim()}>
                  {action.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select onValueChange={(value) => { if (typeof value === "string") onMarkStatus(value) }}>
            <SelectTrigger className="h-7 w-[88px] border-0 bg-muted/45 text-xs text-muted-foreground shadow-none hover:bg-muted">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              {WORKFLOW_STATUS_OPTIONS.map((item) => (
                <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ActionStrip>
      </AiResultPanel>
    </div>
  )
}
