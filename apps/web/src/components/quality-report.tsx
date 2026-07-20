"use client";

import { useState } from "react";
import { Check, AlertTriangle, ChevronDown, Wand2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { QualityCheckReport } from "@/lib/api/client";

const DIMENSIONS = [
  { key: "editorial", label: "编辑质量" },
  { key: "aiTaste", label: "AI 味检测" },
  { key: "attraction", label: "吸引力" },
  { key: "logic", label: "逻辑性" },
] as const;

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function getBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function getCardClasses(passed: boolean): string {
  return passed
    ? "border-green-200 bg-green-50"
    : "border-amber-200 bg-amber-50";
}

function getTitleColor(passed: boolean): string {
  return passed ? "text-green-800" : "text-amber-800";
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-black/5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${getBarColor(score)}`}
        style={{ width: `${score}%` }}
      />
    </div>
  );
}

function DimensionCard({
  label,
  score,
  passed,
  feedback,
  details,
}: {
  label: string;
  score: number;
  passed: boolean;
  feedback: string;
  details?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-medium ${getScoreColor(score)}`}>{label}</span>
        <Badge
          variant={passed ? "default" : "secondary"}
          className="text-xs shrink-0"
        >
          {score}
        </Badge>
      </div>
      <ScoreBar score={score} />
      <p className={`text-xs ${getScoreColor(score)} leading-relaxed`}>{feedback}</p>
      {details && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "收起详情" : "查看详情"}
        </button>
      )}
      {expanded && details && (
        <div className="rounded-md bg-background/60 p-2 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
          {details}
        </div>
      )}
    </div>
  );
}

/**
 * @description qualityreportcard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function QualityReportCard({
  report,
  onPolish,
  isPolishing,
}: {
  report: QualityCheckReport;
  onPolish?: () => void;
  isPolishing?: boolean;
}) {
  const { overall } = report;
  const passed = overall.passed;
  const cardClass = getCardClasses(passed);
  const titleColor = getTitleColor(passed);

  return (
    <Card className={cardClass}>
      <CardHeader className="pb-3">
        <CardTitle className={`text-sm ${titleColor} flex items-center gap-2`}>
          {passed ? (
            <Check className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          四维质量报告
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {DIMENSIONS.map(({ key, label }) => {
            const dim = report[key];
            return (
              <DimensionCard
                key={key}
                label={label}
                score={dim.score}
                passed={dim.passed}
                feedback={dim.feedback}
                details={dim.details}
              />
            );
          })}
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <span className={`text-sm font-medium ${titleColor}`}>总体评分</span>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="w-28">
              <ScoreBar score={overall.score} />
            </div>
            <Badge
              variant={passed ? "default" : "outline"}
              className="text-sm shrink-0"
            >
              {overall.score} 分
            </Badge>
            {passed ? (
              <span className="text-xs text-green-600">✓ 通过质量门控</span>
            ) : (
              <span className="text-xs text-orange-600">⚠ 建议优化</span>
            )}
            {!passed && onPolish && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onPolish}
                disabled={isPolishing}
                className="cursor-pointer gap-1.5 text-xs"
              >
                {isPolishing ? (
                  <><Loader2 className="h-3 w-3 animate-spin" />润色中...</>
                ) : (
                  <><Wand2 className="h-3 w-3" />AI 润色</>
                )}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
