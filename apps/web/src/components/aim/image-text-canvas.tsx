"use client"

import { useEffect, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  ImagePlus,
  Images,
  Loader2,
  Plus,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { generateImageCard, polishScript, uploadFileToStorage } from "@/lib/api/client"
import {
  parseImageTextDoc,
  serializeImageTextDoc,
  type ImageTextPage,
} from "@/lib/image-text-doc"

interface ImageTextCanvasProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 当前 editorText（小红书图文稿），打开时解析为画布结构 */
  source: string
  /** 「同步回文稿」：serialize 结果回调（父组件走 onEditorTextChange 通路，自动版本快照自然生效） */
  onSync: (text: string) => void
}

const CARD_EDITOR_CLASS =
  "w-full rounded-md border bg-background/95 px-2 py-1 text-xs leading-5 outline-none focus:border-primary/40"

/** 小红书图文「图文混排画布」：文稿的结构化编辑视图（逐页配图 + 就地改文案） */
export function ImageTextCanvas({ open, onOpenChange, source, onSync }: ImageTextCanvasProps) {
  const [header, setHeader] = useState("")
  const [pages, setPages] = useState<ImageTextPage[]>([])
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({})
  const [extraPrompt, setExtraPrompt] = useState<Record<string, string>>({})
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [polishingId, setPolishingId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // 打开时把文稿解析为画布；编辑期间不随 source 变化重刷，避免覆盖未同步的修改
  useEffect(() => {
    if (!open) return
    const doc = parseImageTextDoc(source)
    setHeader(doc.header)
    setPages(doc.pages)
    setNoteOpen({})
    setExtraPrompt({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function updatePage(id: string, patch: Partial<ImageTextPage>) {
    setPages((current) => current.map((page) => (page.id === id ? { ...page, ...patch } : page)))
  }

  function movePage(index: number, direction: -1 | 1) {
    setPages((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  function removePage(id: string) {
    setPages((current) => {
      const next = current.filter((page) => page.id !== id)
      // 至少保留一页，画布不出现空态死路
      return next.length > 0 ? next : [{ id: `page-${Date.now()}`, title: "", body: "", note: "" }]
    })
  }

  function addPage(afterIndex?: number) {
    const page: ImageTextPage = { id: `page-${Date.now()}`, title: "", body: "", note: "" }
    setPages((current) => {
      const next = [...current]
      next.splice(afterIndex === undefined ? next.length : afterIndex + 1, 0, page)
      return next
    })
  }

  // ── 图片获取：本地上传（upload-url 预签名直传）──
  async function handleUpload(page: ImageTextPage, file: File) {
    setUploadingId(page.id)
    try {
      const imageUrl = await uploadFileToStorage(file)
      updatePage(page.id, { imageUrl })
      toast.success("图片已上传")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败，请重试")
    } finally {
      setUploadingId(null)
    }
  }

  // ── 图片获取：Seedream 生图（note/画面描述 + 可选补充 prompt，xhs-card 3:4 竖图，默认 2K）──
  async function handleGenerate(page: ImageTextPage) {
    const supplement = (extraPrompt[page.id] ?? "").trim()
    const prompt =
      [page.note.trim(), supplement].filter(Boolean).join("\n") ||
      [page.title.trim(), page.body.trim()].filter(Boolean).join("\n")
    if (!prompt) {
      toast.error("先填写本页配图脚本或文案，再生成图片")
      return
    }
    setGeneratingId(page.id)
    try {
      const imageUrl = await generateImageCard({ prompt })
      updatePage(page.id, { imageUrl })
      toast.success("图片已生成")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生图失败，请重试")
    } finally {
      setGeneratingId(null)
    }
  }

  // ── AI 改写本页文案：复用 scripts/polish（copy_studio.polish 链），去 AI 味、更像真人表达 ──
  async function handlePolishPage(page: ImageTextPage) {
    const text = [page.title.trim(), page.body.trim()].filter(Boolean).join("\n")
    if (text.length < 30) {
      toast.error("本页文案太短（需 30 字以上），先补充内容再改写")
      return
    }
    setPolishingId(page.id)
    try {
      const result = await polishScript({ content: text, weakDimensions: ["aiTaste"] })
      const polished = result.polished.trim()
      if (!polished) throw new Error("改写结果为空")
      // 回写：原标题非空时首行作为新标题、其余进正文；原标题为空时全部进正文
      if (page.title.trim()) {
        const [first, ...rest] = polished.split("\n")
        updatePage(page.id, { title: first.trim(), body: rest.join("\n").trim() })
      } else {
        updatePage(page.id, { body: polished })
      }
      toast.success("已改写本页文案")
    } catch (error) {
      // 失败保留原文，不打断编辑
      toast.error(error instanceof Error ? error.message : "改写失败，已保留原文")
    } finally {
      setPolishingId(null)
    }
  }

  // ── 顶部工具栏 ──
  function handleSync() {
    onSync(serializeImageTextDoc(header, pages))
  }

  async function handleCopyAll() {
    const text = serializeImageTextDoc(header, pages)
    try {
      await navigator.clipboard.writeText(text)
      toast.success("全套文案已复制（笔记头部 + 逐页文案）")
    } catch {
      toast.error("复制失败，请手动全选复制")
    }
  }

  async function handleDownloadAll() {
    const withImages = pages.filter((page) => page.imageUrl)
    if (withImages.length === 0) {
      toast.error("还没有任何页面配图")
      return
    }
    setDownloading(true)
    let ok = 0
    for (const [index, page] of withImages.entries()) {
      // 间隔 300ms 触发，降低浏览器批量下载拦截概率
      if (index > 0) await new Promise((resolve) => setTimeout(resolve, 300))
      const pageNumber = pages.indexOf(page) + 1
      try {
        const response = await fetch(page.imageUrl!)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const blob = await response.blob()
        const ext = blob.type.includes("jpeg") ? "jpg" : "png"
        const objectUrl = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = objectUrl
        anchor.download = `小红书-第${pageNumber}页.${ext}`
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        setTimeout(() => URL.revokeObjectURL(objectUrl), 5000)
        ok++
      } catch {
        // 跨域无法抓取时兜底：新窗口打开原图，用户手动保存
        window.open(page.imageUrl, "_blank")
      }
    }
    setDownloading(false)
    toast.success(`已触发 ${ok}/${withImages.length} 张图片下载`)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Images className="h-4 w-4" />
            图文混排画布
          </DialogTitle>
          <DialogDescription className="text-xs">
            小红书图文的结构化编辑视图：逐页配图、就地改文案。「同步回文稿」会写回编辑区并自动生成版本快照。
          </DialogDescription>
        </DialogHeader>

        {/* 顶部工具栏 */}
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-2">
          <Button size="sm" className="h-8 text-xs" onClick={handleSync}>
            同步回文稿
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => void handleCopyAll()}>
            <Copy className="h-3.5 w-3.5" />
            复制全套文案
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 text-xs"
            disabled={downloading}
            onClick={() => void handleDownloadAll()}
          >
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            下载全部图片
          </Button>
          <span className="ml-auto text-xs text-muted-foreground">共 {pages.length} 页</span>
        </div>

        {/* 笔记头部（标题/正文/话题，不属于任何页） */}
        <div className="border-b px-5 py-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">笔记头部（标题 / 正文 / 话题，不属于任何页）</p>
          <textarea
            value={header}
            onChange={(event) => setHeader(event.target.value)}
            rows={2}
            placeholder="笔记标题、正文、话题标签…"
            className="w-full resize-y rounded-md border bg-background p-2 text-sm leading-6 outline-none focus:border-primary/25"
          />
        </div>

        {/* 页面卡片横向排列 */}
        <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden bg-muted/20 px-5 py-4">
          <div className="flex h-full items-stretch gap-4">
            {pages.map((page, index) => {
              const busy = generatingId === page.id || uploadingId === page.id
              const isCover = index === 0
              return (
                <section
                  key={page.id}
                  className="flex w-[248px] shrink-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm"
                >
                  {/* 页头：页码 + 封面标记 + 排序/增删 */}
                  <div className="flex items-center gap-1 border-b px-2 py-1.5">
                    <span className="text-xs font-medium">第 {index + 1} 页</span>
                    {isCover && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">封面</span>
                    )}
                    <span className="flex-1" />
                    <button type="button" title="上移" className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === 0} onClick={() => movePage(index, -1)}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="下移" className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30" disabled={index === pages.length - 1} onClick={() => movePage(index, 1)}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="在下方新增一页" className="p-1 text-muted-foreground hover:text-foreground" onClick={() => addPage(index)}>
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" title="删除本页" className="p-1 text-muted-foreground hover:text-red-500" onClick={() => removePage(page.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* 图片区（3:4 竖图） */}
                  <div className="relative aspect-[3/4] w-full bg-muted/60">
                    {page.imageUrl ? (
                      <>
                        <img src={page.imageUrl} alt={`第 ${index + 1} 页配图`} className="absolute inset-0 h-full w-full object-cover" />
                        <button
                          type="button"
                          title="清除图片"
                          className="absolute right-1.5 top-1.5 rounded-full bg-background/90 p-1 text-muted-foreground shadow hover:text-red-500"
                          onClick={() => updatePage(page.id, { imageUrl: undefined })}
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {/* 图上文案 overlay 就地编辑 */}
                        <div className="absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/65 via-black/35 to-transparent p-2 pt-6">
                          <input
                            value={page.title}
                            onChange={(event) => updatePage(page.id, { title: event.target.value })}
                            placeholder="图上主文案"
                            className="w-full rounded bg-white/95 px-2 py-1 text-xs font-semibold leading-5 outline-none"
                          />
                          <textarea
                            value={page.body}
                            onChange={(event) => updatePage(page.id, { body: event.target.value })}
                            placeholder="页内补充文案"
                            rows={2}
                            className="w-full resize-none rounded bg-white/90 px-2 py-1 text-xs leading-5 outline-none"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
                        {busy ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          <ImagePlus className="h-5 w-5 text-muted-foreground" />
                        )}
                        <label
                          className={cn(
                            "flex cursor-pointer items-center gap-1 rounded-md border bg-background px-2.5 py-1.5 text-xs hover:bg-muted",
                            busy && "pointer-events-none opacity-50",
                          )}
                        >
                          <Upload className="h-3.5 w-3.5" />
                          本地上传
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={busy}
                            onChange={(event) => {
                              const file = event.target.files?.[0]
                              if (file) void handleUpload(page, file)
                              event.target.value = ""
                            }}
                          />
                        </label>
                        <input
                          value={extraPrompt[page.id] ?? ""}
                          onChange={(event) => setExtraPrompt((current) => ({ ...current, [page.id]: event.target.value }))}
                          placeholder="补充生图要求（可选）"
                          className="w-full rounded-md border bg-background px-2 py-1 text-[11px] leading-5 outline-none focus:border-primary/40"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          disabled={busy}
                          onClick={() => void handleGenerate(page)}
                        >
                          {generatingId === page.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Wand2 className="h-3.5 w-3.5" />
                          )}
                          Seedream 生图
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* 无图时：文案编辑区放在卡片正文（有图时走图片 overlay） */}
                  {!page.imageUrl && (
                    <div className="space-y-1.5 border-t p-2">
                      <input
                        value={page.title}
                        onChange={(event) => updatePage(page.id, { title: event.target.value })}
                        placeholder="图上主文案"
                        className={cn(CARD_EDITOR_CLASS, "font-semibold")}
                      />
                      <textarea
                        value={page.body}
                        onChange={(event) => updatePage(page.id, { body: event.target.value })}
                        placeholder="页内补充文案"
                        rows={2}
                        className={cn(CARD_EDITOR_CLASS, "resize-none")}
                      />
                    </div>
                  )}

                  {/* 配图脚本（折叠） */}
                  <div className="border-t">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between px-2 py-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      onClick={() => setNoteOpen((current) => ({ ...current, [page.id]: !current[page.id] }))}
                    >
                      配图脚本{page.note.trim() ? "" : "（空）"}
                      <span>{noteOpen[page.id] ? "收起" : "展开"}</span>
                    </button>
                    {noteOpen[page.id] && (
                      <textarea
                        value={page.note}
                        onChange={(event) => updatePage(page.id, { note: event.target.value })}
                        rows={3}
                        placeholder="画面描述 / 生图提示词，Seedream 生图时优先使用"
                        className="w-full resize-y border-t bg-muted/30 p-2 text-xs leading-5 outline-none"
                      />
                    )}
                  </div>

                  {/* AI 改写本页 */}
                  <div className="mt-auto border-t p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-full gap-1 text-xs text-muted-foreground hover:text-foreground"
                      disabled={polishingId === page.id}
                      onClick={() => void handlePolishPage(page)}
                    >
                      {polishingId === page.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                      AI 改写本页文案
                    </Button>
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        {/* 底部：添加一页 */}
        <div className="border-t px-5 py-3">
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => addPage()}>
            <Plus className="h-3.5 w-3.5" />
            添加一页
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
