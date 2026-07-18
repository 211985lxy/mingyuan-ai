"use client"

import { useEffect, useState } from "react"
import { Check, Clipboard, LayoutTemplate, Loader2, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  generateXhsTitles,
  reviewXhsNote,
  type XhsReviewResult,
  type XhsTitleVariants,
} from "@/lib/api/client"
import {
  buildXhsNoteDraft,
  computeEmojiDensity,
  XHS_CHECKLIST_LABELS,
} from "@/lib/xhs-review"

/** 问题类型中文标签（与 API 的 type 字段对应） */
const ISSUE_TYPE_LABELS: Record<string, string> = {
  emoji: "emoji",
  spoken: "口语化",
  absolute: "违禁词",
  title: "标题",
  structure: "结构",
  hook: "钩子",
  readability: "可读性",
  hierarchy: "层级",
  collection: "收藏",
  template: "模板感",
}

const CHECKLIST_STATUS_STYLE: Record<string, string> = {
  pass: "bg-emerald-500/10 text-emerald-600",
  warn: "bg-amber-500/10 text-amber-600",
  fail: "bg-red-500/10 text-red-600",
}

const CHECKLIST_STATUS_LABEL: Record<string, string> = {
  pass: "通过",
  warn: "注意",
  fail: "不合",
}

/**
 * 小红书图文编辑面板（P2，方法论内化自 rednote-director-skill）：
 * - 标题/正文/话题标签 三段组织：标题单独编辑，正文在主编辑区，标签独立管理
 * - 一键按模板整理（三段结构回填编辑区）
 * - 风格检查（自检清单：封面钩子/可读性/层级/风格/收藏/模板感/文字堆积/emoji/违禁词）
 * - 标题/钩子/标签变体（点选回填）
 */
export function XhsPanel({
  content,
  onApply,
}: {
  content: string
  /** 回填编辑器：replace 整体替换 | replaceTitle 替换首行 | prepend 插入开头 | append 追加到末尾 */
  onApply: (text: string, mode: "replace" | "replaceTitle" | "prepend" | "append") => void
}) {
  // 标题段：单独编辑（正文仍在主编辑区）；首行非空时作为初始标题
  const [title, setTitle] = useState("")
  const [reviewing, setReviewing] = useState(false)
  const [review, setReview] = useState<XhsReviewResult | null>(null)
  const [titlesLoading, setTitlesLoading] = useState(false)
  const [variants, setVariants] = useState<XhsTitleVariants | null>(null)
  const [copied, setCopied] = useState(false)

  // 编辑区内容变化时，若用户还没手动写过标题，用首行做默认标题
  useEffect(() => {
    setTitle((current) => {
      if (current.trim()) return current
      return content.split("\n").find((line) => line.trim())?.trim().slice(0, 20) || ""
    })
  }, [content])

  const localEmojiDensity = computeEmojiDensity(content)

  function handleOrganize() {
    if (!content.trim()) {
      toast.error("编辑区还没有内容")
      return
    }
    onApply(buildXhsNoteDraft(content), "replace")
    toast.success("已按 标题/正文/话题标签 模板整理")
  }

  async function handleReview() {
    if (content.trim().length < 10) {
      toast.error("正文太短，请先写一些内容")
      return
    }
    setReviewing(true)
    try {
      const result = await reviewXhsNote({ content, title: title || undefined })
      setReview(result)
      if (result.issues.length === 0) toast.success("检查通过，没发现问题")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "风格检查失败，请重试")
    } finally {
      setReviewing(false)
    }
  }

  async function handleTitles() {
    if (content.trim().length < 10) {
      toast.error("正文太短，请先写一些内容")
      return
    }
    setTitlesLoading(true)
    try {
      const result = await generateXhsTitles({ content })
      setVariants(result)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "标题生成失败，请重试")
    } finally {
      setTitlesLoading(false)
    }
  }

  async function handleCopyNote() {
    const note = [title, "", content].filter((part) => part !== "").join("\n")
    try {
      await navigator.clipboard.writeText(note)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
      toast.success("笔记已复制")
    } catch {
      toast.error("复制失败，请手动复制")
    }
  }

  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs leading-5 text-muted-foreground">
        当前稿还没有内容。先在编辑区写好小红书笔记，再用这里做模板整理、风格检查和标题变体。
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1">
      {/* 标题段（≤20 字） */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">标题</span>
          <span
            className={cn(
              "text-[11px]",
              title.replace(/\p{Extended_Pictographic}/gu, "").trim().length > 20
                ? "text-amber-600"
                : "text-muted-foreground",
            )}
          >
            {title.replace(/\p{Extended_Pictographic}/gu, "").trim().length}/20 字
          </span>
        </div>
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="20 字以内，带 1-2 个 emoji"
          className="h-8 text-sm"
        />
      </div>

      {/* 操作区 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={handleOrganize}>
          <LayoutTemplate className="h-3.5 w-3.5" />
          按模板整理
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          disabled={reviewing}
          onClick={() => void handleReview()}
        >
          {reviewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          风格检查
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          disabled={titlesLoading}
          onClick={() => void handleTitles()}
        >
          {titlesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          标题变体
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 px-2 text-xs"
          onClick={() => void handleCopyNote()}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
          复制笔记
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        正文 {content.length} 字 · emoji 密度 {localEmojiDensity}/百字（建议 0.5-3）
      </p>

      {/* 风格检查结果：自检清单 + 问题列表 */}
      {review ? (
        <section className="space-y-2 rounded-md border bg-background p-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">风格检查</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                review.score >= 80
                  ? "bg-emerald-500/10 text-emerald-600"
                  : review.score >= 60
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-red-500/10 text-red-600",
              )}
            >
              {review.score} 分
            </span>
          </div>
          {review.checklist.length > 0 ? (
            <ul className="grid grid-cols-2 gap-1">
              {review.checklist.map((item, index) => (
                <li
                  key={index}
                  className="flex items-center gap-1.5 text-[11px] leading-4"
                  title={item.note}
                >
                  <span
                    className={cn(
                      "shrink-0 rounded px-1 py-0.5 text-[10px]",
                      CHECKLIST_STATUS_STYLE[item.status],
                    )}
                  >
                    {CHECKLIST_STATUS_LABEL[item.status]}
                  </span>
                  <span className="truncate">{XHS_CHECKLIST_LABELS[item.item] || item.item}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {review.issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">未发现问题，可以发布。</p>
          ) : (
            <ul className="space-y-1.5">
              {review.issues.map((issue, index) => (
                <li key={index} className="text-xs leading-5">
                  <span className="mr-1 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {ISSUE_TYPE_LABELS[issue.type] || issue.type}
                  </span>
                  {issue.text}
                  {issue.suggestion ? (
                    <span className="block pl-1 text-[11px] text-muted-foreground">建议：{issue.suggestion}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {/* 标题/钩子/标签变体 */}
      {variants ? (
        <section className="space-y-2 rounded-md border bg-background p-2.5">
          {variants.titles.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium">标题变体（点选填入标题框）</p>
              <ul className="space-y-1">
                {variants.titles.map((item, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-transparent px-2 py-1 text-left text-xs leading-5 hover:border-primary/30 hover:bg-primary/5"
                      onClick={() => {
                        setTitle(item)
                        onApply(item, "replaceTitle")
                        toast.success("已填入标题")
                      }}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {variants.hooks.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium">首句钩子（点选插入正文开头）</p>
              <ul className="space-y-1">
                {variants.hooks.map((item, index) => (
                  <li key={index}>
                    <button
                      type="button"
                      className="w-full rounded-md border border-transparent px-2 py-1 text-left text-xs leading-5 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                      onClick={() => {
                        onApply(item, "prepend")
                        toast.success("已插入钩子")
                      }}
                    >
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {variants.tags.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-medium">话题标签（点选追加到正文末尾）</p>
              <div className="flex flex-wrap gap-1">
                {variants.tags.map((tag, index) => (
                  <button
                    key={index}
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                    onClick={() => {
                      onApply(`#${tag}`, "append")
                      toast.success(`已追加 #${tag}`)
                    }}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}
