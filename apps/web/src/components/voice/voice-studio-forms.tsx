"use client"

import { AudioLines } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { VOICE_MAX_TOTAL_LENGTH, type VoiceModelsResponse } from "@/lib/api/voice"
import { splitTextForSynthesis } from "@/lib/voice/segment-text"

/** 语音工坊的文案输入卡与档位/语速卡（从页面拆出，控制页面文件行数）。 */

export function ScriptInputCard({ text, onChange }: { text: string; onChange: (value: string) => void }) {
  const charCount = text.trim().length
  const tooLong = charCount > VOICE_MAX_TOTAL_LENGTH
  const plannedSegments = splitTextForSynthesis(text).length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <AudioLines className="h-4 w-4 text-primary" />
          输入文案
        </CardTitle>
        <CardDescription>
          支持 [括号] 情绪提示（如 [轻松地]、[停顿]）；超过 1200 字自动按断句分段合成，上限 {VOICE_MAX_TOTAL_LENGTH} 字。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={text}
          onChange={(event) => onChange(event.target.value)}
          placeholder="把口播稿或文案粘贴到这里，例如：\n大家好，我是做暖通的老李。[轻松地] 今天讲讲暖气片为什么一半热一半凉。"
          className="min-h-[220px] text-base leading-7"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={tooLong ? "text-destructive" : ""}>
            {charCount} / {VOICE_MAX_TOTAL_LENGTH} 字
            {plannedSegments > 1 && !tooLong ? ` · 将自动分 ${plannedSegments} 段合成` : ""}
          </span>
          {text ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onChange("")}>
              清空
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

export function ModelSpeedCard({
  models,
  tier,
  onTierChange,
  speed,
  onSpeedChange,
}: {
  models: VoiceModelsResponse | null
  tier: string
  onTierChange: (value: string) => void
  speed: number
  onSpeedChange: (value: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">档位与语速</CardTitle>
        <CardDescription>
          档位默认免费档 s2.1-pro-free（与付费版同权重、无 SLA）；正式投放的配音可切到 s2.1-pro。
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">档位</label>
          <Select value={tier} onValueChange={(value) => value && onTierChange(value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="默认免费档" />
            </SelectTrigger>
            <SelectContent>
              {(models?.tiers ?? []).map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {(models?.tiers ?? []).find((item) => item.id === tier)?.note ?? "默认免费档，适合试听与原型"}
          </p>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">语速 {speed.toFixed(1)}x</label>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.1}
            value={speed}
            onChange={(event) => onSpeedChange(Number(event.target.value))}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">调整语速会重新合成，试听请耐心等待几秒。</p>
        </div>
      </CardContent>
    </Card>
  )
}
