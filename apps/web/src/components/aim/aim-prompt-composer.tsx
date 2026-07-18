"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ChevronDown, Loader2, Mic, Plus, Search, Send, Square, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AimStudioModule, AimWorkbenchSkill } from "@/lib/aim-agent-guides"

interface AimPromptComposerProps {
  value: string
  placeholder: string
  busy: boolean
  isRecording: boolean
  isTranscribing: boolean
  isGenerating: boolean
  canGenerate: boolean
  primaryActionLabel: string
  onChange: (value: string) => void
  onGenerate: () => void
  onStop?: () => void
  onStartRecording: () => void
  onStopRecording: () => void
  skills?: AimWorkbenchSkill[]
  onUseSkill?: (skill: AimWorkbenchSkill) => void
  /** 统一创作台模块入口按钮（仅当智能体 guide 提供 modules 时渲染） */
  modules?: AimStudioModule[]
  onUseModule?: (module: AimStudioModule) => void
  imageAttachments?: Array<{ id: string; name: string; previewUrl: string }>
  onAddImages?: (files: FileList) => void
  onRemoveImage?: (id: string) => void
}

export function AimPromptComposer({
  value,
  placeholder,
  busy,
  isRecording,
  isTranscribing,
  isGenerating,
  canGenerate,
  primaryActionLabel,
  onChange,
  onGenerate,
  onStop,
  onStartRecording,
  onStopRecording,
  skills = [],
  onUseSkill,
  modules = [],
  onUseModule,
  imageAttachments = [],
  onAddImages,
  onRemoveImage,
}: AimPromptComposerProps) {
  const canSend = !busy && !isRecording && (value.trim().length > 0 || imageAttachments.length > 0)
  const canSubmit = canSend && canGenerate
  const canStop = busy && !isRecording && Boolean(onStop)
  const rootRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState("")
  const filteredSkills = useMemo(() => {
    const query = skillQuery.trim().toLowerCase()
    if (!query) return skills
    return skills.filter((skill) => `${skill.label} ${skill.description}`.toLowerCase().includes(query))
  }, [skillQuery, skills])

  useEffect(() => {
    if (!skillsOpen) return

    function closeOnOutside(event: PointerEvent) {
      if (rootRef.current?.contains(event.target as Node)) return
      setSkillsOpen(false)
      setSkillQuery("")
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      setSkillsOpen(false)
      setSkillQuery("")
    }

    document.addEventListener("pointerdown", closeOnOutside)
    document.addEventListener("keydown", closeOnEscape)
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside)
      document.removeEventListener("keydown", closeOnEscape)
    }
  }, [skillsOpen])

  return (
    <div ref={rootRef} className="mx-auto max-w-6xl w-full">
      <div className="relative overflow-visible rounded-2xl border border-primary/20 bg-card shadow-sm focus-within:ring-2 focus-within:ring-primary/20">
        {modules.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 px-3 pt-2">
            {modules.map((module) => (
              <button
                key={module.id}
                type="button"
                title={module.description}
                disabled={busy}
                onClick={() => onUseModule?.(module)}
                className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50"
              >
                {module.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
            event.preventDefault()
            if (canSubmit) onGenerate()
          }}
          rows={1}
          placeholder={placeholder}
          disabled={busy}
          className="max-h-40 min-h-[44px] w-full resize-none bg-transparent px-4 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
        />
        {imageAttachments.length > 0 && (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2">
            {imageAttachments.map((image) => (
              <div key={image.id} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                <img src={image.previewUrl} alt={image.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-1 top-1 rounded-full bg-background/90 p-0.5 text-foreground shadow"
                  onClick={() => onRemoveImage?.(image.id)}
                  disabled={busy}
                  title="移除图片"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {skillsOpen && (
          <div className="absolute bottom-12 left-3 z-20 w-[min(420px,calc(100vw-2rem))] rounded-xl border bg-popover p-2 text-popover-foreground shadow-lg">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={skillQuery}
                onChange={(event) => setSkillQuery(event.target.value)}
                placeholder="搜索技能"
                className="h-8 pl-8 text-xs"
                autoFocus
              />
            </div>
            <div className="mt-2 max-h-72 overflow-y-auto">
              {skills.length === 0 ? (
                <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">当前智能体暂无内置技能</p>
              ) : filteredSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className="w-full rounded-lg px-2.5 py-2 text-left hover:bg-muted"
                  onClick={() => {
                    onUseSkill?.(skill)
                    setSkillsOpen(false)
                    setSkillQuery("")
                  }}
                >
                  <span className="block text-sm font-medium leading-5">{skill.label}</span>
                  <span className="mt-0.5 block text-xs leading-4 text-muted-foreground">{skill.description}</span>
                </button>
              ))}
              {skills.length > 0 && filteredSkills.length === 0 && (
                <p className="px-2.5 py-4 text-center text-xs text-muted-foreground">没有找到匹配技能</p>
              )}
            </div>
            <div className="mt-1 border-t pt-1">
              <button type="button" className="w-full rounded-md px-2.5 py-1.5 text-left text-xs text-muted-foreground" disabled>
                导入技能（暂未开放）
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 border-t bg-muted/10 px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-h-4 text-[11px] leading-4 text-muted-foreground">
            {isTranscribing ? (
              <span className="text-primary">语音转写中...</span>
            ) : isRecording ? (
              <span className="text-red-500">正在录音，点击停止后可发送</span>
            ) : (
              "Enter 发送 · Shift+Enter 换行"
            )}
          </p>
          <div className="flex items-center justify-end gap-1.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) onAddImages?.(event.target.files)
                event.target.value = ""
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              title="添加图片"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSkillsOpen((open) => !open)}
              disabled={busy}
            >
              技能
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={isRecording ? onStopRecording : onStartRecording}
              disabled={busy && !isRecording}
              title="语音输入"
            >
              {isRecording ? <span className="text-xs text-red-500">停止</span> : <Mic className="h-4 w-4" />}
            </Button>
            {canStop && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs text-red-600"
                onClick={onStop}
                title="停止"
              >
                <Square className="h-3.5 w-3.5" />
                停止
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              onClick={onGenerate}
              disabled={!canSubmit}
              className="h-8 w-8 p-0 shadow-xs"
              title={primaryActionLabel}
            >
              {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
