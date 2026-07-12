"use client";

import { ChevronLeft, Clock, Eye, Loader2, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScriptCommandCenter } from "@/features/create/components/workbench-overview";
import type { ApiPackagingTemplateRecommendation, BackgroundMusicSelection, MaterialAssignment } from "@/types/api";

const RECOMMENDATION_TIER_LABELS: Record<NonNullable<ApiPackagingTemplateRecommendation["tier"]>, string> = {
  recommended: "推荐",
  acceptable: "可用",
  weak_fit: "弱匹配",
  blocked: "不可用",
};

function isAiMaterial(material: MaterialAssignment): boolean {
  return material.source === "ai_pexels" || material.source === "ai_pixabay";
}

interface PhaseGenerateProps {
  resolvedPackagingLabel: string
  selectedPackagingRecommendation: ApiPackagingTemplateRecommendation | null
  hasResolvedPackaging: boolean
  editedScript: string
  materials: MaterialAssignment[]
  backgroundMusic: BackgroundMusicSelection | null
  blockingAiCount: number
  incompleteManualCount: number
  isSubmitting: boolean
  taskError: string | null
  onSubmit: () => void
  onSaveDraft: () => void
  onBack: () => void
}

function getMaterialCounts(materials: MaterialAssignment[]) {
  const ai = materials.filter(isAiMaterial).length
  const manual = materials.filter((item) => !isAiMaterial(item)).length
  const usable = materials.filter((item) => isAiMaterial(item) || Boolean(item.assetId)).length
  return { ai, manual, usable }
}

function ProductionSummary({ props, counts }: { props: PhaseGenerateProps; counts: ReturnType<typeof getMaterialCounts> }) {
  const recommendation = props.selectedPackagingRecommendation
  return <>
    <ScriptCommandCenter stage="待成片文案" title="这条文案将驱动整条视频" subtitle="系统会使用包装模板和素材完成画面呈现，不需要额外选择讲述形象。" script={props.editedScript} badges={["文案定稿", "素材承载信息点", "包装控制节奏"]} />
    <Separator />
    <Card><CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4 text-primary" />生产总览</CardTitle><p className="text-xs text-muted-foreground">确认以下所有选项无误后，点击生成视频</p></CardHeader><CardContent>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div className="space-y-1 sm:col-span-2"><p className="text-muted-foreground text-xs">文案层 · 最终口播</p><p className="font-medium line-clamp-3">{props.editedScript || "未编辑"}</p><p className="text-xs text-muted-foreground">约 {props.editedScript.length} 字 · 预估 {Math.ceil(props.editedScript.length / 3.5)} 秒</p></div>
        <div className="space-y-1"><p className="text-muted-foreground text-xs">包装层 · 包装模板</p><p className="font-medium">{props.resolvedPackagingLabel}</p>{recommendation && <p className="text-xs text-muted-foreground">{RECOMMENDATION_TIER_LABELS[recommendation.tier]} · 适配分 {recommendation.score}</p>}</div>
        <div className="space-y-1"><p className="text-muted-foreground text-xs">包装层 · 素材</p><p className="font-medium">{props.materials.length > 0 ? `${counts.manual} 个手动素材 + ${counts.ai} 个 AI 素材` : "无额外素材"}</p>{props.blockingAiCount > 0 && <p className="text-xs text-amber-600">其中 {props.blockingAiCount} 个 AI 素材正在准备中</p>}</div>
        <div className="space-y-1"><p className="text-muted-foreground text-xs">包装层 · 背景音乐</p><p className="font-medium">{props.backgroundMusic?.assetId ? "已覆盖为自定义 BGM" : "使用模板默认音乐"}</p>{recommendation?.bgmGuidance && <p className="text-xs text-muted-foreground">建议风格：{recommendation.bgmGuidance}</p>}</div>
      </div>
    </CardContent></Card>
  </>
}

function GenerationAlerts({ recommendation, blockingAiCount, incompleteManualCount, taskError }: Pick<PhaseGenerateProps, "blockingAiCount" | "incompleteManualCount" | "taskError"> & { recommendation: ApiPackagingTemplateRecommendation | null }) {
  return <>
    {recommendation?.reasons?.length ? <Card className="border-primary/15 bg-primary/[0.03]"><CardContent><p className="text-sm font-medium">这套包装为什么成立</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{recommendation.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></CardContent></Card> : null}
    {blockingAiCount > 0 && <Card className="border-amber-300 bg-amber-50"><CardContent className="text-sm text-amber-800"><p>AI 补充素材还有 {blockingAiCount} 个正在准备中，请等待完成后再提交。</p></CardContent></Card>}
    {incompleteManualCount > 0 && <Card className="border-amber-200 bg-amber-50/50"><CardContent className="text-sm text-amber-600"><p>手动素材里还有 {incompleteManualCount} 个卡片没有关联资产，提交时将自动跳过。</p></CardContent></Card>}
    {taskError && <Card className="border-red-300 bg-red-50"><CardContent><p className="text-sm text-red-700">{taskError}</p></CardContent></Card>}
  </>
}

function GenerationActionBar({ canSubmit, isSubmitting, onBack, onSaveDraft, onSubmit }: Pick<PhaseGenerateProps, "isSubmitting" | "onBack" | "onSaveDraft" | "onSubmit"> & { canSubmit: boolean }) {
  return <div className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur-sm p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"><div className="flex items-center justify-between max-w-4xl mx-auto">
    <Button type="button" variant="outline" onClick={onBack} className="cursor-pointer"><ChevronLeft className="h-4 w-4 mr-1" /> 上一步</Button>
    <div className="flex items-center gap-2 sm:gap-3"><Button type="button" variant="outline" onClick={onSaveDraft} className="cursor-pointer hidden sm:flex">保存草稿</Button><Button type="button" size="lg" onClick={onSubmit} disabled={!canSubmit} className="cursor-pointer gap-2">{isSubmitting ? <><Loader2 className="h-4 w-4 animate-spin" />提交中...</> : <><Play className="h-4 w-4" />生成视频</>}</Button></div>
  </div></div>
}

export function PhaseGenerate(props: PhaseGenerateProps) {
  const counts = getMaterialCounts(props.materials)
  const canSubmit = Boolean(props.editedScript.trim()) && !props.isSubmitting && props.hasResolvedPackaging && props.blockingAiCount === 0 && counts.usable > 0
  return <div className="space-y-6">
    <div><h2 className="text-lg font-semibold flex items-center gap-2"><Play className="h-5 w-5 text-primary" />内容生产官 · 成片确认</h2><p className="text-sm text-muted-foreground mt-1">最后确认文案、包装模板、素材和背景音乐是否齐备，然后提交生成视频。</p></div>
    <ProductionSummary props={props} counts={counts} />
    <GenerationAlerts recommendation={props.selectedPackagingRecommendation} blockingAiCount={props.blockingAiCount} incompleteManualCount={props.incompleteManualCount} taskError={props.taskError} />
    <div className="h-20" />
    <GenerationActionBar canSubmit={canSubmit} {...props} />
  </div>
}

export function SubmissionPolling({ taskStatus }: { taskStatus: string | null }) {
  const isQueued = taskStatus === "queued"

  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-6">
      <div className="relative">
        {isQueued ? (
          <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
            <Clock className="h-6 w-6 text-blue-600" />
          </div>
        ) : (
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        )}
      </div>
      <div className="text-center space-y-2">
        <h2 className="text-lg font-semibold">
          {isQueued ? "任务排队中" : "视频生成中"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isQueued
            ? "当前使用人数较多，您的任务正在排队中，通常几分钟内会开始生成..."
            : taskStatus === "processing"
              ? "AI 正在为你制作视频，通常需要 1-3 分钟..."
              : "正在提交任务..."}
        </p>
      </div>
    </div>
  );
}
