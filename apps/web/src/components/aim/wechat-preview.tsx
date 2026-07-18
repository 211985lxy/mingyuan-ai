"use client"

import { useMemo, useState } from "react"
import { Check, Clipboard } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  WECHAT_THEMES,
  extractWechatTitle,
  renderWechatArticleHtml,
  renderWechatHtml,
  stripFirstH1Line,
  wechatPlainText,
} from "@/lib/wechat-style"

interface WechatPreviewProps {
  content: string
  title?: string
}

/** execCommand 兜底：把 HTML 放进临时离屏容器，选中后执行 copy（剪贴板 API 不可用/被拦截时用） */
function fallbackCopyRichText(html: string): boolean {
  const container = document.createElement("div")
  container.innerHTML = html
  container.style.position = "fixed"
  container.style.left = "-9999px"
  container.style.top = "0"
  document.body.appendChild(container)
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(container)
  selection?.removeAllRanges()
  selection?.addRange(range)
  let ok = false
  try {
    ok = document.execCommand("copy")
  } catch {
    ok = false
  }
  selection?.removeAllRanges()
  container.remove()
  return ok
}

/** 公众号文章实景预览：手机尺寸还原文章页，支持主题切换与一键复制富文本 */
export function WechatPreview({ content, title }: WechatPreviewProps) {
  const [themeId, setThemeId] = useState(WECHAT_THEMES[0].id)
  // null = 用户未手动改过标题，跟随正文第一个 # 标题 / title prop
  const [titleDraft, setTitleDraft] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const theme = useMemo(
    () => WECHAT_THEMES.find((item) => item.id === themeId) ?? WECHAT_THEMES[0],
    [themeId],
  )
  const autoTitle = useMemo(() => extractWechatTitle(content) ?? "未命名文章", [content])
  const displayTitle = (titleDraft ?? title ?? autoTitle).trim() || "未命名文章"
  // 标题已在文章头部展示，正文第一个 # 标题行剔除，避免预览/复制重复
  const body = useMemo(() => stripFirstH1Line(content), [content])
  const bodyHtml = useMemo(() => renderWechatHtml(body, theme), [body, theme])
  const dateLabel = useMemo(
    () => new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" }),
    [],
  )

  async function handleCopy() {
    // 复制内容 = 含标题样式的完整文章 HTML（100% 内联样式，粘贴进公众号后台保留样式）
    const html = renderWechatArticleHtml(displayTitle, body, theme)
    const plain = `${displayTitle}\n\n${wechatPlainText(body)}`.trim()
    try {
      if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
        throw new Error("clipboard api unavailable")
      }
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ])
      toast.success("富文本已复制，可直接粘贴到公众号后台")
    } catch {
      if (fallbackCopyRichText(html)) {
        toast.success("富文本已复制，可直接粘贴到公众号后台")
      } else {
        toast.error("复制失败，请手动全选预览内容复制")
        return
      }
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  if (!content.trim()) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs leading-5 text-muted-foreground">
        当前稿还没有内容。先在编辑区写好公众号文章，再切换到这里预览样式、复制富文本。
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* 工具区：标题输入 + 主题切换 + 复制富文本 */}
      <div className="space-y-2">
        <Input
          value={titleDraft ?? displayTitle}
          onChange={(event) => setTitleDraft(event.target.value)}
          placeholder="文章标题"
          className="h-8 text-sm"
        />
        <div className="flex flex-wrap items-center gap-1.5">
          {WECHAT_THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setThemeId(item.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                themeId === item.id
                  ? "border-primary/50 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
          <Button
            size="sm"
            className="ml-auto h-7 gap-1 px-2.5 text-xs"
            onClick={() => void handleCopy()}
            title="复制含标题样式的完整文章 HTML，粘贴到公众号后台保留样式"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Clipboard className="h-3.5 w-3.5" />}
            复制富文本
          </Button>
        </div>
      </div>

      {/* 手机尺寸实景预览（约 375px 宽，模拟公众号文章页） */}
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border bg-muted/30 p-3">
        <div className="mx-auto w-full max-w-[375px] overflow-hidden rounded-2xl border bg-white shadow-sm">
          <article className="px-5 py-6">
            <h1 className="text-[22px] font-bold leading-snug text-[#1a1a1a]">{displayTitle}</h1>
            <p className="mt-2 text-xs text-[#9a9a9a]">明动 AIM · {dateLabel}</p>
            {/* 正文 HTML 由 lib 层生成，源文本已整体转义 */}
            <div className="mt-5" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
          </article>
        </div>
      </div>
    </div>
  )
}
