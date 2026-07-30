"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { Check, Clipboard, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { applySelectionReplacement, type TextSelectionRange } from "@/lib/aim-editor"
import {
  INLINE_SELECTION_ACTIONS,
  buildInlineSelectionPrompt,
  hashInlineContent,
  type InlinePendingReplacement,
  type InlineSelectionActionId,
} from "@/lib/aim/inline-editor-session"
import { AIM_SOFT_ACTION_CLASS } from "@/lib/aim/workbench-display"
import type { ContentFormat } from "@/lib/api/client"

/** 底部悬浮输入框 + 安全边距，编辑框需铺满到其上方 */
const EDITOR_BOTTOM_RESERVE_PX = 148
const EDITOR_MIN_HEIGHT_PX = 360

function syncEditorViewportHeight(el: HTMLTextAreaElement) {
  const top = el.getBoundingClientRect().top
  const available = Math.floor(window.innerHeight - top - EDITOR_BOTTOM_RESERVE_PX)
  el.style.height = `${Math.max(EDITOR_MIN_HEIGHT_PX, available)}px`
}

export interface AimInlineDocumentCardProps {
  messageId: string
  generationId: string
  format: ContentFormat
  content: string
  /** 口播脚本用竹简渲染；其余 Markdown */
  renderMode?: "zhujian" | "markdown"
  renderView: (text: string) => React.ReactNode
  isSessionOwner: boolean
  canStartEdit: boolean
  onRequestEditOwnership: () => boolean
  onReleaseEditOwnership: () => void
  onContentSaved: (content: string) => void
  onSelectionRewrite: (input: {
    prompt: string
    selectionText: string
    range: TextSelectionRange
    draftContent: string
  }) => void
  referenceText?: string
  persona?: string
  topicTitle?: string
  projectId?: string
}

function readSelection(element: HTMLTextAreaElement): { text: string; range: TextSelectionRange } {
  const range = { start: element.selectionStart, end: element.selectionEnd }
  return { text: element.value.slice(range.start, range.end), range }
}

/** 对话区内联文案卡片：查看、复制、编辑与编辑态选区改写。 */
export function AimInlineDocumentCard(props: AimInlineDocumentCardProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(props.content)
  const [saving, setSaving] = useState(false)
  const [selection, setSelection] = useState<{ text: string; range: TextSelectionRange }>({ text: "", range: { start: 0, end: 0 } })
  const [pending, setPending] = useState<InlinePendingReplacement | null>(null)
  const [customRequest, setCustomRequest] = useState("")
  const [copied, setCopied] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // 编辑态：把文案框高度铺满到工作台底部输入区上方（用户标注的可视区域）
  useLayoutEffect(() => {
    if (!editing) return
    const el = textareaRef.current
    if (!el) return

    const sync = () => syncEditorViewportHeight(el)
    // 先把工具栏顶到可视区，再按「工具栏下方 → 底部输入框」剩余高度铺满
    el.parentElement?.scrollIntoView({ block: "start", behavior: "auto" })
    sync()
    const timer = window.setTimeout(sync, 60)
    window.addEventListener("resize", sync)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("resize", sync)
      el.style.height = ""
    }
  }, [editing])

  const dirty = editing && draft !== props.content

  function beginEdit() {
    if (!props.canStartEdit && !props.isSessionOwner) {
      toast.error("请先保存或取消当前正在编辑的文案")
      return
    }
    if (!props.onRequestEditOwnership()) return
    setDraft(props.content)
    setEditing(true)
  }

  function cancelEdit() {
    if (dirty && !window.confirm("有未保存修改，确定取消？")) return
    setEditing(false)
    setDraft(props.content)
    setPending(null)
    props.onReleaseEditOwnership()
  }

  async function save() {
    if (!draft.trim()) {
      toast.error("正文不能为空")
      return
    }
    setSaving(true)
    try {
      const response = await fetch("/api/content-versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          generationId: props.generationId,
          format: props.format,
          content: draft,
          source: "manual_edit",
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        toast.error(typeof payload?.error === "string" ? payload.error : "保存失败，草稿已保留")
        return
      }
      const saved = typeof payload?.data?.content === "string" ? payload.data.content : draft
      props.onContentSaved(saved)
      setDraft(saved)
      setEditing(false)
      setPending(null)
      props.onReleaseEditOwnership()
      toast.success("已保存")
    } catch {
      toast.error("保存失败，请检查网络后重试")
    } finally {
      setSaving(false)
    }
  }

  function runSelectionAction(action: InlineSelectionActionId) {
    if (!selection.text.trim() || selection.range.end <= selection.range.start) {
      toast.error("请先选中要修改的文字")
      return
    }
    const prompt = buildInlineSelectionPrompt(action, selection.text, customRequest)
    setPending({
      original: selection.text,
      replacement: "",
      range: selection.range,
      baseContentHash: hashInlineContent(draft),
    })
    props.onSelectionRewrite({
      prompt,
      selectionText: selection.text,
      range: selection.range,
      draftContent: draft,
    })
    toast.message("已发起局部改写，完成后请在对话中应用替换稿")
  }

  function applyPending(replacement: string) {
    if (!pending) return
    if (hashInlineContent(draft) !== pending.baseContentHash) {
      toast.error("正文已变化，请重新选择后再应用")
      setPending(null)
      return
    }
    const next = applySelectionReplacement(draft, pending.range, replacement)
    setDraft(next)
    setPending(null)
    toast.success("已应用到当前草稿，请保存")
  }

  async function copyText() {
    await navigator.clipboard.writeText(editing ? draft : props.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 600)
    toast.success("已复制")
  }

  const selectionBarVisible = editing && selection.text.trim().length > 0

  const toolbar = (
    <div className="flex flex-wrap items-center justify-end gap-1">
        {editing ? (
          <>
            <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} disabled={saving} onClick={cancelEdit}><X className="h-3.5 w-3.5" />取消</Button>
            <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              {saving ? "保存中" : "保存"}
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={beginEdit}>编辑</Button>
        )}
        <Button size="sm" variant="ghost" className={AIM_SOFT_ACTION_CLASS} onClick={() => void copyText()}>
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}复制
        </Button>
    </div>
  )

  return (
    <div className={editing ? "flex flex-col gap-3" : "space-y-3"}>
      {toolbar}
      {editing ? (
        <textarea
          ref={textareaRef}
          className="min-h-[22rem] w-full resize-y rounded-md border bg-background p-4 text-base leading-8 outline-none focus:border-primary/30"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onSelect={(event) => setSelection(readSelection(event.currentTarget))}
          placeholder="在这里编辑文案"
        />
      ) : (
        <div className="py-1">{props.renderView(props.content)}</div>
      )}

      {selectionBarVisible ? (
        <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 p-2">
          {INLINE_SELECTION_ACTIONS.map((action) => (
            <Button key={action.id} size="sm" variant="ghost" className="h-7 text-xs" onClick={() => runSelectionAction(action.id)}>
              {action.label}
            </Button>
          ))}
          <input
            className="h-7 min-w-[140px] flex-1 rounded-md border bg-background px-2 text-xs"
            placeholder="自定义要求"
            value={customRequest}
            onChange={(event) => setCustomRequest(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runSelectionAction("custom")
            }}
          />
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => runSelectionAction("custom")}>发送</Button>
        </div>
      ) : null}

      {pending && pending.replacement ? (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <div className="font-medium">局部替换预览</div>
          <div className="grid gap-2 sm:grid-cols-2">
            <pre className="whitespace-pre-wrap rounded bg-background p-2 text-muted-foreground">{pending.original}</pre>
            <pre className="whitespace-pre-wrap rounded bg-background p-2">{pending.replacement}</pre>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={() => applyPending(pending.replacement)}>应用</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPending(null)}>放弃</Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
