"use client"

import { useMemo } from "react"
import Link from "next/link"
import { Loader2, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AdvancedDrawer } from "@/components/studio/advanced-drawer"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { splitTextForSynthesis } from "@/lib/voice/segment-text"
import { VOICE_MAX_TOTAL_LENGTH, type VoiceModelsResponse } from "@/lib/api/voice"

/** Step 2 念文案：一屏只回答「念什么」；语速档位收进高级抽屉。 */
export function AudioScriptStep(props: {
  text: string
  onTextChange: (value: string) => void
  models: VoiceModelsResponse | null
  tier: string
  onTierChange: (value: string) => void
  speed: number
  onSpeedChange: (value: number) => void
  phase: "idle" | "synthesizing" | "saving"
  progress: { done: number; total: number }
  error: string | null
  onGenerate: () => void
  onBack: () => void
}) {
  const charCount = props.text.trim().length
  const tooLong = charCount > VOICE_MAX_TOTAL_LENGTH
  const segments = useMemo(() => splitTextForSynthesis(props.text).length, [props.text])
  const canGenerate = charCount > 0 && !tooLong && props.phase === "idle"

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">把文案贴进来</h2>
          <p className="text-sm text-muted-foreground">
            支持 [括号] 情绪提示；超过 1200 字自动按断句分段合成。
          </p>
        </div>
        <ScriptAdvancedDrawer
          models={props.models}
          tier={props.tier}
          onTierChange={props.onTierChange}
          speed={props.speed}
          onSpeedChange={props.onSpeedChange}
        />
      </header>

      <ScriptEditorCard text={props.text} onTextChange={props.onTextChange} />

      {props.error ? (
        <p className="text-sm text-destructive" role="alert">
          {props.error}
        </p>
      ) : null}

      <ScriptActionBar
        charCount={charCount}
        segments={segments}
        phase={props.phase}
        progress={props.progress}
        canGenerate={canGenerate}
        onGenerate={props.onGenerate}
        onBack={props.onBack}
      />

      <p className="text-center text-xs text-muted-foreground">
        想让数字人开口说这段文案？
        <Link href="/studio/video" className="ml-1 text-primary underline-offset-2 hover:underline">
          去视频工作台
        </Link>
      </p>
    </section>
  )
}

/** 高级设置：档位与语速，折叠在右侧抽屉。 */
function ScriptAdvancedDrawer(props: {
  models: VoiceModelsResponse | null
  tier: string
  onTierChange: (value: string) => void
  speed: number
  onSpeedChange: (value: number) => void
}) {
  return (
    <AdvancedDrawer title="高级设置" description="调整后重新生成即可生效。">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">档位</label>
        <Select value={props.tier} onValueChange={(value) => value && props.onTierChange(value)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="默认免费档" />
          </SelectTrigger>
          <SelectContent>
            {(props.models?.tiers ?? []).map((item) => (
              <SelectItem key={item.id} value={item.id}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {(props.models?.tiers ?? []).find((item) => item.id === props.tier)?.note ?? "默认免费档，适合试听与原型"}
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">语速 {props.speed.toFixed(1)}x</label>
        <input
          type="range"
          min={0.5}
          max={2}
          step={0.1}
          value={props.speed}
          onChange={(event) => props.onSpeedChange(Number(event.target.value))}
          className="w-full"
          aria-label="语速"
        />
        <p className="text-xs text-muted-foreground">调整语速会重新合成。</p>
      </div>
    </AdvancedDrawer>
  )
}

function ScriptEditorCard({
  text,
  onTextChange,
}: {
  text: string
  onTextChange: (value: string) => void
}) {
  const charCount = text.trim().length
  const tooLong = charCount > VOICE_MAX_TOTAL_LENGTH

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <Textarea
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={"把口播稿或文案粘贴到这里，例如：\n大家好，我是做暖通的老李。[轻松地] 今天讲讲暖气片为什么一半热一半凉。"}
          className="min-h-[200px] text-base leading-7"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={tooLong ? "text-destructive" : ""}>
            {charCount} / {VOICE_MAX_TOTAL_LENGTH} 字
          </span>
          {text ? (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => onTextChange("")}>
              清空
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function ScriptActionBar({
  charCount,
  segments,
  phase,
  progress,
  canGenerate,
  onGenerate,
  onBack,
}: {
  charCount: number
  segments: number
  phase: "idle" | "synthesizing" | "saving"
  progress: { done: number; total: number }
  canGenerate: boolean
  onGenerate: () => void
  onBack: () => void
}) {
  const hint =
    charCount === 0
      ? "先输入文案"
      : charCount > VOICE_MAX_TOTAL_LENGTH
        ? `超出 ${VOICE_MAX_TOTAL_LENGTH} 字，请拆分后再试`
        : ""
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBack}>
          上一步
        </Button>
        <div className="flex items-center gap-3">
          {!canGenerate && phase === "idle" && hint ? (
            <span className="text-xs text-muted-foreground">{hint}</span>
          ) : null}
          {phase === "synthesizing" ? (
            <span className="text-xs text-muted-foreground">免费档较慢（约 12.5 字/秒），请勿关闭页面</span>
          ) : null}
          <Button type="button" disabled={!canGenerate} onClick={onGenerate}>
            {phase === "idle" ? (
              <Volume2 className="mr-1.5 h-4 w-4" />
            ) : (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            {phase === "synthesizing"
              ? `合成中 ${progress.done}/${progress.total} 段`
              : phase === "saving"
                ? "保存中…"
                : "生成配音"}
          </Button>
        </div>
      </div>
      {segments > 1 ? (
        <p className="text-right text-xs text-muted-foreground">本文将分 {segments} 段顺序合成后自动拼接</p>
      ) : null}
    </div>
  )
}
