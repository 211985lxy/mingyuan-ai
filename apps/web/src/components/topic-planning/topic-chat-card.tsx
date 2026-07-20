"use client"

import { Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { TopicChatResponse } from "@/lib/api/client"

interface TopicChatCardProps {
  value: string
  loading: boolean
  disabled: boolean
  reply: TopicChatResponse | null
  onChange: (value: string) => void
  onSubmit: () => void
}

/**
 * @description topicchatcard
 * @param options - 配置选项
 * @returns 无返回值
 */
export function TopicChatCard({ value, loading, disabled, reply, onChange, onSubmit }: TopicChatCardProps) {
  return (
    <Card className="order-3 border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle>临时想法</CardTitle>
        <CardDescription>丢一句客户问题、现场灵感或对标观察，先整理出方向。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={value} placeholder="比如：今天客户又问我为什么报价比别人高" className="min-h-24" onChange={(event) => onChange(event.target.value)} />
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={loading || disabled}><Sparkles className="mr-1 h-4 w-4" />{loading ? "整理中..." : "整理成方向"}</Button>
        </div>
        {reply ? (
          <div className="rounded-lg border bg-background p-3 text-sm leading-6">
            <p className="font-medium">{reply.reply.summary}</p>
            <p className="mt-2"><b>优先方向：</b>{reply.reply.recommendedTitle}</p>
            <p><b>开头：</b>{reply.reply.opening}</p>
            {reply.reply.alternatives.length > 0 ? <p><b>备选角度：</b>{reply.reply.alternatives.join("、")}</p> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
