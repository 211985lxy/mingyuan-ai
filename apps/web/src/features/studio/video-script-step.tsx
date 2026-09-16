"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fetchVoiceModels, type VoiceModelOption } from "@/lib/api/voice"

export const MAX_SCRIPT_CHARS = 2500

export type VideoVoiceSource = "tts" | "own_voice"

export function estimateSpeechSeconds(text: string): number {
  // 中文口播约 4 字/秒，用于成片时长预估
  return Math.max(8, Math.round(text.replace(/\s+/g, "").length / 4))
}

/** 拉取我的克隆音色（voiceSource = own_voice 时）。 */
export async function loadMyVoices(): Promise<VoiceModelOption[]> {
  try {
    const res = await fetchVoiceModels("mine")
    return res.voices ?? []
  } catch {
    // 音色列表失败不阻塞：提交时用平台默认音色
    return []
  }
}

/** Step 2 声音与文案：形象配套音色 / 我的克隆音色，文案带自动时长预估与音频预演。 */
export function VideoScriptStep(props: {
  script: string
  onScriptChange: (value: string) => void
  voiceSource: VideoVoiceSource
  onVoiceSourceChange: (source: VideoVoiceSource) => void
  fishVoices: VoiceModelOption[]
  fishVoiceId: string
  onFishVoiceChange: (value: string) => void
  fishVoiceFallbackHint: string
  onPreview: () => void
  previewing: boolean
  previewUrl: string | null
  onBack: () => void
  onNext: () => void
}) {
  const cleanedLength = useMemo(() => props.script.replace(/\s+/g, "").length, [props.script])
  const speechSeconds = estimateSpeechSeconds(props.script)
  const tooLong = cleanedLength > MAX_SCRIPT_CHARS
  const canNext = cleanedLength > 0 && !tooLong

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">声音与文案</h2>
        <p className="text-sm text-muted-foreground">先用普通配音试听效果，满意再渲染成片。</p>
      </header>

      <VoiceSourcePicker
        voiceSource={props.voiceSource}
        onVoiceSourceChange={props.onVoiceSourceChange}
        fishVoices={props.fishVoices}
        fishVoiceId={props.fishVoiceId}
        onFishVoiceChange={props.onFishVoiceChange}
        hint={props.fishVoiceFallbackHint}
      />

      <ScriptEditorCard
        script={props.script}
        onScriptChange={props.onScriptChange}
        cleanedLength={cleanedLength}
        speechSeconds={speechSeconds}
        tooLong={tooLong}
        previewUrl={props.previewUrl}
      />

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={props.onBack}>
          上一步
        </Button>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={!canNext || props.previewing} onClick={props.onPreview}>
            {props.previewing ? "预演合成中…" : "▶ 音频预演"}
          </Button>
          <Button type="button" disabled={!canNext} onClick={props.onNext}>
            下一步：出成片
          </Button>
        </div>
      </div>
    </section>
  )
}

function VoiceSourcePicker({
  voiceSource,
  onVoiceSourceChange,
  fishVoices,
  fishVoiceId,
  onFishVoiceChange,
  hint,
}: {
  voiceSource: VideoVoiceSource
  onVoiceSourceChange: (source: VideoVoiceSource) => void
  fishVoices: VoiceModelOption[]
  fishVoiceId: string
  onFishVoiceChange: (value: string) => void
  hint: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">声音</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Button
          type="button"
          variant={voiceSource === "tts" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onVoiceSourceChange("tts")}
        >
          形象配套音色
        </Button>
        <Button
          type="button"
          variant={voiceSource === "own_voice" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onVoiceSourceChange("own_voice")}
        >
          我的克隆音色
        </Button>
        {voiceSource === "own_voice" ? (
          <Select value={fishVoiceId} onValueChange={(value) => value && onFishVoiceChange(value)}>
            <SelectTrigger className="h-7 w-[200px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">平台默认音色</SelectItem>
              {fishVoices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>{voice.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {voiceSource === "own_voice" ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ScriptEditorCard({
  script,
  onScriptChange,
  cleanedLength,
  speechSeconds,
  tooLong,
  previewUrl,
}: {
  script: string
  onScriptChange: (value: string) => void
  cleanedLength: number
  speechSeconds: number
  tooLong: boolean
  previewUrl: string | null
}) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <Textarea
          value={script}
          onChange={(event) => onScriptChange(event.target.value)}
          rows={8}
          className="resize-y text-base leading-7"
          placeholder="粘贴或编辑要让数字人念的口播正文…"
        />
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className={tooLong ? "text-destructive" : ""}>
            约 {speechSeconds}s · {cleanedLength} 字
          </span>
          {tooLong ? (
            <span className="text-amber-700 dark:text-amber-300">建议不超过 {MAX_SCRIPT_CHARS} 字，先去创作台精简</span>
          ) : null}
        </div>
        {previewUrl ? (
          <audio controls src={previewUrl} className="w-full" preload="metadata">
            <track kind="captions" />
          </audio>
        ) : null}
      </CardContent>
    </Card>
  )
}
