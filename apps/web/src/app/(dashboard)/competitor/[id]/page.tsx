"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { getCompetitorAnalysis } from "@/lib/api/client"
import { formatDate, platformLabel, proxyAvatarUrl } from "@/lib/competitor-diagnosis/format"
import { buildCompetitorDiagnosisViewModel } from "@/lib/competitor-diagnosis/build-view-model"
import type { ApiCompetitorAnalysis } from "@/types/api"
import { ReportHero } from "@/components/competitor-diagnosis/report-hero"
import { VerdictBanner } from "@/components/competitor-diagnosis/verdict-banner"
import { QuestionCard } from "@/components/competitor-diagnosis/question-card"
import { SectionTitle } from "@/components/competitor-diagnosis/section-title"
import { ContentStrategyEvidence } from "@/components/competitor-diagnosis/content-strategy-evidence"
import { EvidenceDashboard } from "@/components/competitor-diagnosis/evidence-dashboard"
import { RawReportAppendix } from "@/components/competitor-diagnosis/raw-report-appendix"

// ─── Constants ──────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["completed", "failed"])
const POLL_INTERVAL = 3000

const PIPELINE_STEPS = [
  { status: "pending", label: "待处理", sublabel: "分析任务已创建，等待开始…" },
  { status: "scraping", label: "数据采集中", sublabel: "正在读取账号页、作品数据和评论样本…" },
  { status: "enriching", label: "数据处理中", sublabel: "正在计算互动指标、发布规律和内容表现…" },
  { status: "analyzing", label: "AI 分析中", sublabel: "Claude 正在生成6维评分与深度报告…" },
  { status: "completed", label: "分析完成", sublabel: "" },
]

// ─── State Views（状态机，保持不变）─────────────────────

function FullPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Skeleton className="h-72 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  )
}

function NotFoundState({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-lg mx-auto mt-8">
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center gap-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold">记录不存在</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            分析记录不存在或已被删除
          </p>
          <Button variant="outline" onClick={onBack}>返回列表</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function FailedState({ analysis, onBack }: { analysis: ApiCompetitorAnalysis; onBack: () => void }) {
  return (
    <div className="max-w-lg mx-auto mt-8">
      <Card>
        <CardContent className="flex flex-col items-center py-12 text-center gap-4">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <h2 className="text-lg font-semibold">分析失败</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {analysis.errorMessage ?? "分析过程中发生错误，请重试"}
          </p>
          <Button variant="outline" onClick={onBack}>返回重试</Button>
        </CardContent>
      </Card>
    </div>
  )
}

function ProgressView({ analysis }: { analysis: ApiCompetitorAnalysis }) {
  const currentIdx = PIPELINE_STEPS.findIndex((s) => s.status === analysis.status)

  return (
    <div className="space-y-8">
      <PageHeader
        title="优质账号分析中…"
        subtitle="请耐心等待，数据采集和 AI 分析通常需要 1-2 分钟"
        backHref="/competitor"
      />
      {analysis.accountName && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-muted/50 rounded-lg">
          {analysis.accountAvatar && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={proxyAvatarUrl(analysis.accountAvatar)}
              alt={analysis.accountName}
              className="h-10 w-10 rounded-full object-cover"
            />
          )}
          <div>
            <p className="font-medium">{analysis.accountName}</p>
            <p className="text-sm text-muted-foreground">{platformLabel(analysis.platform)}</p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="py-8 px-6">
          <h2 className="text-base font-semibold mb-6">正在分析中…</h2>
          <div className="space-y-5">
            {PIPELINE_STEPS.filter((s) => s.status !== "completed").map((step, idx) => {
              const isCurrent = idx === currentIdx
              const isDone = idx < currentIdx
              return (
                <div key={step.status} className="flex gap-3 items-start">
                  <div className="mt-0.5 shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : isCurrent ? (
                      <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                    )}
                  </div>
                  <div>
                    <p
                      className={`text-sm font-medium ${
                        isDone ? "text-green-600" : isCurrent ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </p>
                    {isCurrent && step.sublabel && (
                      <p className="text-xs text-muted-foreground mt-0.5">{step.sublabel}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Report View（诊断报告结构）──────────────────────────

function ReportView({ analysis }: { analysis: ApiCompetitorAnalysis }) {
  const vm = buildCompetitorDiagnosisViewModel(analysis)

  return (
    <div className="space-y-8">
      <PageHeader
        title={`${vm.accountName} · IP资产诊断报告`}
        subtitle={`分析于 ${formatDate(vm.completedAt)}`}
        backHref="/competitor"
      />

      {/* 1. Hero：账号信息 + 总评分/等级/置信度 + 一句话判断 + 六维 */}
      <ReportHero vm={vm} />

      {/* 2. 总判断条 */}
      <VerdictBanner verdict={vm.verdict} />

      {/* 3. 内容策略证据 */}
      <ContentStrategyEvidence data={vm.contentStrategy} />

      {/* 4. 账号诊断 */}
      <section className="space-y-4">
        <SectionTitle
          title="账号诊断"
          subtitle="保留关键判断和证据，少做延展推演。"
          anchor="diagnosis"
        />
        <div className="space-y-4">
          {vm.diagnosisQuestions.map((q) => (
            <QuestionCard key={q.questionNo} question={q} />
          ))}
        </div>
      </section>

      {/* 5. 数据证据 */}
      <EvidenceDashboard evidence={vm.evidence} />

      {/* 6. 原始报告附录（折叠）*/}
      <RawReportAppendix vm={vm} />
    </div>
  )
}

// ─── Main Page Component ─────────────────────────────────

export default function CompetitorReportPage() {
  const params = useParams<{ id: string }>() ?? { id: "" }
  const router = useRouter()
  const [analysis, setAnalysis] = useState<ApiCompetitorAnalysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Initial fetch
  useEffect(() => {
    async function fetchAnalysis() {
      try {
        const data = await getCompetitorAnalysis(params.id)
        setAnalysis(data)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalysis()
  }, [params.id])

  // Poll until terminal state
  const analysisStatus = analysis?.status
  useEffect(() => {
    if (!analysisStatus || TERMINAL_STATUSES.has(analysisStatus)) return
    const interval = setInterval(async () => {
      try {
        const data = await getCompetitorAnalysis(params.id)
        setAnalysis(data)
        if (TERMINAL_STATUSES.has(data.status)) clearInterval(interval)
      } catch {
        clearInterval(interval)
      }
    }, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [analysisStatus, params.id])

  if (loading) return <FullPageSkeleton />
  if (notFound) return <NotFoundState onBack={() => router.push("/competitor")} />
  if (!analysis) return null
  if (analysis.status === "failed") return <FailedState analysis={analysis} onBack={() => router.push("/competitor")} />
  if (analysis.status !== "completed") return <ProgressView analysis={analysis} />
  return <ReportView analysis={analysis} />
}
