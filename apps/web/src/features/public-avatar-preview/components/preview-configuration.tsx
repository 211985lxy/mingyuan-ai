import { Pause, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { PreviewablePublicVoice } from "../contracts"

const PRESET_TEXTS = [
  "你好，我来用一句话告诉你，这个方案为什么更适合你。",
  "今天用 10 秒讲清楚，我们这项服务到底能帮你解决什么问题。",
  "如果你也在做个人 IP，这条建议能帮你少走很多弯路。",
]

export function PreviewConfiguration({
  avatarSource,
  draftText,
  maxTextLength,
  voices,
  resolvedVoiceId,
  currentVoice,
  playingVoiceId,
  onDraftTextChange,
  onVoiceChange,
  onVoicePreview,
}: {
  avatarSource: "public" | "mine"
  draftText: string
  maxTextLength: number
  voices: PreviewablePublicVoice[]
  resolvedVoiceId: string | null
  currentVoice: PreviewablePublicVoice | null
  playingVoiceId: string | null
  onDraftTextChange: (text: string) => void
  onVoiceChange: (voiceId: string) => void
  onVoicePreview: (voice: PreviewablePublicVoice) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="public-avatar-preview-text">试看文案</Label>
          <span className="text-xs text-muted-foreground">{draftText.trim().length}/{maxTextLength}</span>
        </div>
        <Textarea
          id="public-avatar-preview-text"
          value={draftText}
          onChange={(event) => onDraftTextChange(event.target.value)}
          rows={5}
          placeholder={avatarSource === "mine" ? "输入一句你想让这个数字人说的话" : "输入一句你想让这个公共数字人说的话"}
        />
        <div className="flex flex-wrap gap-2">
          {PRESET_TEXTS.map((text) => (
            <Button key={text} type="button" variant="outline" size="sm" className="cursor-pointer" onClick={() => onDraftTextChange(text)}>
              {text.length > 18 ? `${text.slice(0, 18)}...` : text}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>声音</Label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select
            value={resolvedVoiceId ?? undefined}
            onValueChange={(value) => {
              if (value) onVoiceChange(value)
            }}
          >
            <SelectTrigger className="cursor-pointer sm:flex-1">
              <SelectValue placeholder="选择一个声音">
                {currentVoice ? `${currentVoice.name}${currentVoice.gender ? ` · ${currentVoice.gender}` : ""}` : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>{voice.name}{voice.gender ? ` · ${voice.gender}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={() => currentVoice && onVoicePreview(currentVoice)} disabled={!currentVoice?.demoUrl || currentVoice.demoUrl === "#"} className="cursor-pointer gap-2">
            {playingVoiceId === currentVoice?.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            试听声音
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">先听声线，再生成口播试看。最终正式视频将沿用你当前选中的声音。</p>
      </div>
    </>
  )
}
