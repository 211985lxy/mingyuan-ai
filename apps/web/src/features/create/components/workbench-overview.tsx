"use client";

import { Check, Clock, FileText, Sparkles, PenLine, Package, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const PHASES = [
  { label: "选题", icon: Sparkles, layer: "输入" },
  { label: "定文案", icon: PenLine, layer: "主控" },
  { label: "定包装", icon: Package, layer: "证据" },
  { label: "出视频", icon: Play, layer: "演绎" },
] as const;

const PRODUCT_FLOW_STEPS = [
  "填写基础信息问卷",
  "AI 建立三维 IP 档案",
  "生成 4 个爆款选题",
  "自动生成口播文案",
  "审核文案与热点融合",
] as const;

export function PageHeader() {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">明远AIM智能体</h1>
        <Badge variant="outline" className="text-[10px] sm:text-xs">
          AI内容总监
        </Badge>
      </div>
      <p className="text-muted-foreground mt-0.5 sm:mt-1 text-xs sm:text-sm">
        把业务资料、老板经验、项目案例沉淀成可持续生产的内容资产。
      </p>
    </div>
  );
}

export function ProductFlowOverview({
  ipProfileReady,
  hasThreeDPositioning,
  topicReady,
  scriptReady,
  qualityChecked,
  hotTopicTitle,
}: {
  ipProfileReady: boolean;
  hasThreeDPositioning: boolean;
  topicReady: boolean;
  scriptReady: boolean;
  qualityChecked: boolean;
  hotTopicTitle: string | null;
}) {
  const completed = [
    ipProfileReady,
    hasThreeDPositioning,
    topicReady,
    scriptReady,
    qualityChecked,
  ];

  return (
    <Card className="border-primary/15 bg-primary/[0.02]">
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">核心流程</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              基础问卷 → 三维 IP 档案 → 4 个选题 → 自动文案 → 审核与热点融合
            </p>
          </div>
          {hotTopicTitle ? (
            <Badge variant="outline" className="w-fit border-orange-300 text-orange-600">
              热点融合：{hotTopicTitle}
            </Badge>
          ) : (
            <Badge variant="secondary" className="w-fit">热点融合可选</Badge>
          )}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {PRODUCT_FLOW_STEPS.map((label, index) => {
            const done = completed[index];
            const active = !done && completed.slice(0, index).every(Boolean);
            return (
              <div
                key={label}
                className={`rounded-md border px-3 py-2 text-xs ${
                  done
                    ? "border-green-200 bg-green-50 text-green-700"
                    : active
                      ? "border-primary/30 bg-background text-foreground"
                      : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {done ? (
                    <Check className="h-3.5 w-3.5" />
                  ) : active ? (
                    <Clock className="h-3.5 w-3.5" />
                  ) : (
                    <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border text-[10px]">
                      {index + 1}
                    </span>
                  )}
                  <span className="font-medium">{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function ScriptCommandCenter({
  title,
  subtitle,
  script,
  stage,
  badges = [],
}: {
  title: string;
  subtitle: string;
  script: string;
  stage: string;
  badges?: string[];
}) {
  const normalizedScript = script.trim();
  const charCount = normalizedScript.length;
  const duration = Math.max(0, Math.ceil(charCount / 3.5));

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 text-primary">
                {stage}
              </Badge>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                {title}
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="text-xs">{charCount} 字</Badge>
            <Badge variant="secondary" className="text-xs">约 {duration} 秒</Badge>
          </div>
        </div>
        <div className="rounded-md border bg-background/70 p-3">
          <p className="text-sm leading-relaxed line-clamp-5">
            {normalizedScript || "文案还未就绪"}
          </p>
        </div>
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <Badge key={badge} variant="outline" className="text-xs">
                {badge}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function PhaseIndicator({
  currentPhase,
  onPhaseClick,
  readiness,
}: {
  currentPhase: number;
  onPhaseClick: (phase: number) => void;
  readiness: boolean[];
}) {
  return (
    <nav aria-label="创建进度" className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto">
      {PHASES.map(({ label, layer }, index) => {
        const isCompleted = index < currentPhase;
        const isActive = index === currentPhase;
        const isReady = readiness[index];
        const canClick = isCompleted || isActive;

        return (
          <div key={index} className="flex items-center gap-0.5 sm:gap-1">
            {index > 0 && (
              <div
                className={`h-px w-4 sm:w-10 border-t-2 border-dashed transition-colors duration-200 shrink-0 ${
                  isCompleted ? "border-primary" : "border-border"
                }`}
              />
            )}
            <button
              type="button"
              onClick={() => canClick && onPhaseClick(index)}
              className={`flex items-center gap-1 sm:gap-2 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium transition-colors duration-200 whitespace-nowrap shrink-0 ${
                isCompleted
                  ? "bg-primary text-primary-foreground cursor-pointer hover:opacity-90"
                  : isActive
                    ? "bg-primary/10 text-primary ring-1 ring-primary/30 cursor-default"
                    : "bg-muted text-muted-foreground cursor-default"
              }`}
              aria-current={isActive ? "step" : undefined}
            >
              {isCompleted ? (
                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              ) : isReady ? (
                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
              ) : (
                <span className="flex h-3.5 w-3.5 sm:h-4 sm:w-4 items-center justify-center text-[10px] sm:text-xs font-semibold">
                  {index + 1}
                </span>
              )}
              <span>{label}</span>
              <span className="hidden md:inline text-[10px] opacity-60">
                ({layer})
              </span>
            </button>
          </div>
        );
      })}
    </nav>
  );
}
