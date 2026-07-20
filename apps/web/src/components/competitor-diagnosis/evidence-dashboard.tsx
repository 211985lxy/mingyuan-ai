import { ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { SectionTitle } from "./section-title"
import {
  DAYS,
  DAY_LABELS,
  HOURS,
  cellIntensity,
  formatCount,
} from "@/lib/competitor-diagnosis/format"
import type { EvidenceData } from "@/lib/competitor-diagnosis/types"

function EvidenceMetrics({ evidence }: { evidence: EvidenceData }) {
  const metrics = [
    { label: "平均互动率", value: `${evidence.avgEngagementRate.toFixed(2)}%` },
    { label: "平均点赞", value: formatCount(evidence.avgLikes) },
    { label: "平均评论", value: formatCount(evidence.avgComments) },
    { label: "平均分享", value: formatCount(evidence.avgShares) },
  ]
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {metrics.map((metric) => (
        <Card key={metric.label} className="p-3 bg-muted/40 border-0">
          <p className="text-xs text-muted-foreground">{metric.label}</p>
          <p className="text-lg font-bold mt-0.5">{metric.value}</p>
        </Card>
      ))}
    </div>
  )
}

function TopVideosTable({ evidence }: { evidence: EvidenceData }) {
  if (evidence.topVideos.length === 0) return null
  return (
    <Card>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-4 pb-2">
        Top 视频排行
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">#</TableHead>
            <TableHead>标题</TableHead>
            <TableHead>播放</TableHead>
            <TableHead>点赞</TableHead>
            <TableHead>互动率</TableHead>
            <TableHead className="w-8" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {evidence.topVideos.slice(0, 10).map((video, index) => (
            <TableRow key={index}>
              <TableCell className="text-muted-foreground text-sm">{index + 1}</TableCell>
              <TableCell className="text-sm max-w-[180px] truncate">{video.title || "—"}</TableCell>
              <TableCell className="text-sm">{video.views > 0 ? formatCount(video.views) : "-"}</TableCell>
              <TableCell className="text-sm">{formatCount(video.likes)}</TableCell>
              <TableCell className="text-sm">{video.engagement_rate.toFixed(1)}%</TableCell>
              <TableCell>
                {video.url && (
                  <a href={video.url} target="_blank" rel="noopener noreferrer" onClick={(event) => event.stopPropagation()}>
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                  </a>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function PostingHeatmap({ evidence }: { evidence: EvidenceData }) {
  const maxHeat = Math.max(0, ...Object.values(evidence.postingHeatmap))
  return (
    <Card className="p-4 overflow-x-auto">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">发布时间热力图</p>
      <div className="min-w-[420px]">
        <div className="flex mb-1">
          <div className="w-7 shrink-0" />
          {HOURS.map((hour) => (
            <div key={hour} className="flex-1 text-center text-[10px] text-muted-foreground">
              {hour % 4 === 0 ? hour : ""}
            </div>
          ))}
        </div>
        {DAYS.map((day) => (
          <div key={day} className="flex mb-1 items-center">
            <div className="w-7 shrink-0 text-xs text-muted-foreground text-right pr-2">{DAY_LABELS[day]}</div>
            {HOURS.map((hour) => (
              <div
                key={hour}
                className={`flex-1 h-5 rounded-sm mx-px ${cellIntensity(day, hour, evidence.postingHeatmap, maxHeat)}`}
              />
            ))}
          </div>
        ))}
      </div>
    </Card>
  )
}

/**
 * @description evidencedashboard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function EvidenceDashboard({ evidence }: { evidence: EvidenceData }) {
  return (
    <section className="space-y-3">
      <SectionTitle
        title="数据证据"
        subtitle="前面的结论由这些数据支撑——它们是证据，不是主叙事。"
        anchor="evidence"
      />
      <EvidenceMetrics evidence={evidence} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopVideosTable evidence={evidence} />
        <PostingHeatmap evidence={evidence} />
      </div>
    </section>
  )
}
