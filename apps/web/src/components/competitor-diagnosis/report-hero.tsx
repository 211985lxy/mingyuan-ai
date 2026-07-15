"use client"

import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ConfidenceTag } from "./confidence-tag"
import {
  SCORE_DIMENSIONS,
  formatCount,
  platformLabel,
  proxyAvatarUrl,
  scoreColor,
} from "@/lib/competitor-diagnosis/format"
import type { CompetitorDiagnosisViewModel } from "@/lib/competitor-diagnosis/types"

function AccountSummary({ vm }: { vm: CompetitorDiagnosisViewModel }) {
  const analysis = vm.rawAnalysis
  const stats = [
    analysis.followerCount != null && { label: "粉丝", value: formatCount(analysis.followerCount) },
    analysis.accountFollowingCount != null && { label: "关注", value: formatCount(analysis.accountFollowingCount) },
    analysis.accountTotalLikes != null && { label: "获赞", value: formatCount(analysis.accountTotalLikes) },
    analysis.videoCount != null && { label: "作品", value: formatCount(analysis.videoCount) },
  ].filter((stat): stat is { label: string; value: string } => stat !== false)

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-col sm:flex-row gap-5">
          <div className="shrink-0">
            {analysis.accountAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxyAvatarUrl(analysis.accountAvatar)}
                alt={analysis.accountName ?? ""}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
                {(analysis.accountName ?? "?")[0]}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <p className="text-lg font-semibold truncate">{vm.accountName}</p>
              <Badge variant="outline" className="text-xs shrink-0">{platformLabel(analysis.platform)}</Badge>
              {analysis.accountIsVerified && <Badge variant="secondary" className="text-xs shrink-0">已认证</Badge>}
            </div>
            {analysis.accountSignature && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{analysis.accountSignature}</p>
            )}
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <p className="text-base font-semibold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-center sm:text-right self-center">
            <p className={`text-4xl font-bold ${scoreColor(vm.overallScore)}`}>{Math.round(vm.overallScore)}</p>
            <p className="text-xs text-muted-foreground">综合评分</p>
            <p className="text-xs font-medium mt-1 text-foreground/80">{vm.assetGrade}</p>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-sm">
            <span className="text-muted-foreground">总判断：</span>
            <span className="font-medium">{vm.oneLineVerdict}</span>
          </p>
          <ConfidenceTag level={vm.confidence} reason="综合数据完整度与样本量得出" />
        </div>
      </CardContent>
    </Card>
  )
}

function ScoreOverview({ vm }: { vm: CompetitorDiagnosisViewModel }) {
  const scores = vm.rawAnalysis.analysisResult?.scores
  const radarData = SCORE_DIMENSIONS.map((dimension) => ({
    subject: dimension.label,
    value: (scores?.[dimension.key as keyof NonNullable<typeof scores>] as number) ?? 0,
    fullMark: 100,
  }))
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="p-4">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">六维评分</p>
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="subject" className="text-xs" />
            <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
            <Radar
              name="评分"
              dataKey="value"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.3}
            />
          </RadarChart>
        </ResponsiveContainer>
      </Card>
      <div className="grid grid-cols-2 gap-3 content-start">
        {SCORE_DIMENSIONS.map(({ key, label, description }) => {
          const score = (scores?.[key as keyof NonNullable<typeof scores>] as number) ?? 0
          return (
            <Card key={key} className="p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${scoreColor(score)}`}>{Math.round(score)}</p>
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

export function ReportHero({ vm }: { vm: CompetitorDiagnosisViewModel }) {
  return (
    <div className="space-y-4">
      <AccountSummary vm={vm} />
      <ScoreOverview vm={vm} />
    </div>
  )
}
