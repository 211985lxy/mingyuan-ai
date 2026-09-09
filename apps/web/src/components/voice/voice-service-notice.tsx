"use client"

import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * 语音服务状态通知：未配置（琥珀，带配置指引）/ 瞬时异常（中性，真实原因）。
 * 配置指引只在 configured===false 时出现，避免网络错误被误读为缺密钥。
 */
export function VoiceServiceNotice(props: {
  kind: "unconfigured" | "error"
  message: string | null
  onRetry?: () => void
}) {
  const unconfigured = props.kind === "unconfigured"
  return (
    <Card
      className={
        unconfigured
          ? "border-amber-300/60 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/30"
          : "border-border/60 bg-muted/30"
      }
    >
      <CardContent className="flex items-center gap-3 py-4 text-sm">
        <div className="min-w-0 flex-1">
          <p className={unconfigured ? "text-amber-900 dark:text-amber-200" : "text-foreground"}>
            {props.message ?? (unconfigured ? "配音服务不可用" : "音色列表暂时拉取失败")}
          </p>
          {unconfigured ? (
            <p className="mt-1 text-xs opacity-80">
              需要在服务端环境变量配置 FISH_AUDIO_API_KEY（免费档默认 s2.1-pro-free），配置后点「刷新音色」。
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">通常是网络抖动，点「刷新音色」重试；期间仍可用平台默认音色。</p>
          )}
        </div>
        {props.onRetry ? (
          <Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1 text-xs" onClick={props.onRetry}>
            <RefreshCw className="h-3.5 w-3.5" /> 刷新音色
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}
