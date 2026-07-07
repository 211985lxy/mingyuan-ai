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

/**
 * 首屏 Hero：账号基础信息 + 总评分/资产等级/置信度 + 一句话判断 + 六维雷达。
 * 目标：5 秒内知道"这个账号是不是有价值的 IP 资产"。
 */
export function ReportHero({ vm }: { vm: CompetitorDiagnosisViewModel }) {
  const a = vm.rawAnalysis
  const scores = a.analysisResult?.scores

  const radarData = SCORE_DIMENSIONS.map((d) => ({
    subject: d.label,
    value: (scores?.[d.key as keyof NonNullable<typeof scores>] as number) ?? 0,
    fullMark: 100,
  }))

  const stats = [
    a.followerCount != null && { label: "粉丝", value: formatCount(a.followerCount) },
    a.accountFollowingCount != null && { label: "关注", value: formatCount(a.accountFollowingCount) },
    a.accountTotalLikes != null && { label: "获赞", value: formatCount(a.accountTotalLikes) },
    a.videoCount != null && { label: "作品", value: formatCount(a.videoCount) },
  ].filter((s): s is { label: string; value: string } => s !== false)

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-5">
            <div className="shrink-0">
              {a.accountAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxyAvatarUrl(a.accountAvatar)}
                  alt={a.accountName ?? ""}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-border"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground">
                  {(a.accountName ?? "?")[0]}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <p className="text-lg font-semibold truncate">{vm.accountName}</p>
                <Badge variant="outline" className="text-xs shrink-0">
                  {platformLabel(a.platform)}
                </Badge>
                {a.accountIsVerified && (
                  <Badge variant="secondary" className="text-xs shrink-0">已认证</Badge>
                )}
              </div>
              {a.accountSignature && (
                <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{a.accountSignature}</p>
              )}
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                {stats.map((s) => (
                  <div key={s.label}>
                    <p className="text-base font-semibold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0 text-center sm:text-right self-center">
              <p className={`text-4xl font-bold ${scoreColor(vm.overallScore)}`}>
                {Math.round(vm.overallScore)}
              </p>
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            六维评分
          </p>
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
            const s = (scores?.[key as keyof NonNullable<typeof scores>] as number) ?? 0
            return (
              <Card key={key} className="p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold mt-1 ${scoreColor(s)}`}>{Math.round(s)}</p>
                <p className="text-xs text-muted-foreground mt-1">{description}</p>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
