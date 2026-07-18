"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, ShieldCheck, AlertTriangle, CheckCircle2, BookOpen } from "lucide-react"
import { toast } from "sonner"
import {
  compileIpWikiPositioning,
  saveIpWikiPages,
  listIpWikiPages,
  lintIpWikiPages,
  type IpWikiCompiledPage,
  type IpWikiPageDTO,
  type IpWikiLintReportDTO,
} from "@/lib/api/client"
import type { IpWikiDialogContext } from "@/lib/aim/workbench-types"

const PAGE_TYPE_LABELS: Record<string, string> = {
  positioning: "定位主张",
  persona: "人设",
  content_strategy: "内容策略底盘",
  audience: "目标人群",
  conversion_path: "成交路径",
  topic_direction: "选题方向",
  index: "维基目录",
  log: "操作日志",
}

/**
 * IP 定位维基弹窗：闭环 Ingest（编译→人工审核→确认写入）+ 维基总览 + Lint 体检。
 *
 * 设计契合项目「人工确认、不自动入库」约束：编译只是提议，必须人工审核、可编辑、
 * 勾选后点「确认写入」才落库；写入后自动刷新总览并跑一次体检。
 */
/**
 * IP 定位维基弹窗：闭环 Ingest（编译→人工审核→确认写入）+ 维基总览 + Lint 体检。
 *
 * 设计契合项目「人工确认、不自动入库」约束：编译只是提议，必须人工审核、可编辑、
 * 勾选后点「确认写入」才落库；写入后自动刷新总览并跑一次体检。
 *
 * 由父级按 sourceGenerationId 传 key 控制挂载：每次「打开」都是新挂载，状态天然重置，
 * 挂载即自动编译一次——无需在 effect 里 setState、也无需渲染期读写 ref。
 */
export function IpWikiDialog({
  context,
  onClose,
}: {
  context: IpWikiDialogContext
  onClose: () => void
}) {
  const [tab, setTab] = useState<"compile" | "wiki">("compile")
  const [compiling, setCompiling] = useState(() => !!context.positioningText)
  const [proposed, setProposed] = useState<IpWikiCompiledPage[] | null>(null)
  const [excluded, setExcluded] = useState<Set<number>>(new Set())
  const [saving, setSaving] = useState(false)
  const [wikiPages, setWikiPages] = useState<IpWikiPageDTO[] | null>(null)
  const [loadingWiki, setLoadingWiki] = useState(false)
  const [lintReport, setLintReport] = useState<IpWikiLintReportDTO | null>(null)
  const [linting, setLinting] = useState(false)

  const projectId = context.projectId

  async function performCompile(): Promise<IpWikiCompiledPage[]> {
    const res = await compileIpWikiPositioning({
      projectId: context.projectId,
      sourceGenerationId: context.sourceGenerationId,
      positioningText: context.positioningText ?? "",
    })
    return res.pages
  }

  // 挂载即编译：compiling 初值由 useState 按是否有文本决定，所有 setState 都在 await 之后，
  // 不在 effect 体里同步调用（满足 react-hooks/set-state-in-effect）。
  useEffect(() => {
    if (!context.positioningText) return
    let cancelled = false
    void (async () => {
      try {
        const pages = await performCompile()
        if (cancelled) return
        setProposed(pages)
        setExcluded(new Set())
        if (pages.length === 0) toast.info("这份定位方案暂无可编译内容，可改写后再试")
      } catch (e) {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "维基编译失败")
      } finally {
        if (!cancelled) setCompiling(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 手动「重新编译」按钮：在事件处理器里 setState 不受 effect 规则限制
  async function runCompile() {
    setCompiling(true)
    setProposed(null)
    setExcluded(new Set())
    try {
      const pages = await performCompile()
      setProposed(pages)
      if (pages.length === 0) toast.info("这份定位方案暂无可编译内容，可改写后再试")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "维基编译失败")
    } finally {
      setCompiling(false)
    }
  }

  async function loadWiki() {
    if (!projectId) return
    setLoadingWiki(true)
    try {
      setWikiPages(await listIpWikiPages(projectId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载维基失败")
    } finally {
      setLoadingWiki(false)
    }
  }

  async function runLint() {
    if (!projectId) return
    setLinting(true)
    try {
      setLintReport(await lintIpWikiPages(projectId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "维基体检失败")
    } finally {
      setLinting(false)
    }
  }

  async function handleSave() {
    if (!context || !proposed) return
    const pagesToSave = proposed.filter((_, i) => !excluded.has(i))
    if (pagesToSave.length === 0) {
      toast.error("请至少保留一页再写入")
      return
    }
    setSaving(true)
    try {
      await saveIpWikiPages({
        projectId: context.projectId,
        sourceGenerationId: context.sourceGenerationId,
        pages: pagesToSave,
      })
      toast.success(`已写入 ${pagesToSave.length} 页 IP 定位维基`)
      await loadWiki()
      setTab("wiki")
      void runLint()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "维基保存失败")
    } finally {
      setSaving(false)
    }
  }

  function onTabChange(value: string) {
    setTab(value as "compile" | "wiki")
    if (value === "wiki" && wikiPages === null) void loadWiki()
  }

  function toggleExcluded(index: number) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  function updateProposed(index: number, patch: Partial<IpWikiCompiledPage>) {
    setProposed((prev) =>
      prev ? prev.map((p, i) => (i === index ? { ...p, ...patch } : p)) : prev,
    )
  }

  const selectedCount = proposed ? proposed.length - excluded.size : 0

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            IP 定位维基
          </DialogTitle>
          <DialogDescription>
            把定位方案编译成结构化维基页，作为该 IP 生成内容时的全局定位底盘。审核确认后才写入，下游内容生产官 / 深度文案官会自动读取。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={onTabChange} className="w-full">
          <TabsList className="bg-transparent p-0 gap-1 border-b border-border/40 pb-1 rounded-none">
            <TabsTrigger value="compile" className="text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-muted/80">
              编译确认
            </TabsTrigger>
            <TabsTrigger value="wiki" className="text-xs px-3 py-1.5 rounded-md data-[state=active]:bg-muted/80">
              维基总览 / 体检
            </TabsTrigger>
          </TabsList>

          {/* ── 编译确认（Ingest）── */}
          <TabsContent value="compile" className="space-y-3 mt-3">
            {!context.positioningText ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                请先在定位策划官生成一份定位方案（诊断报告），再来编译。
              </p>
            ) : compiling ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在把定位方案编译成维基页…
              </div>
            ) : proposed && proposed.length > 0 ? (
              <>
                <p className="text-xs text-muted-foreground">
                  已编译 {proposed.length} 页提议。可逐页编辑内容、勾选要写入的页，确认后写入（同类型旧页会归档，版本递增）。
                </p>
                <div className="space-y-3">
                  {proposed.map((page, i) => {
                    const isExcluded = excluded.has(i)
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 transition-colors ${isExcluded ? "opacity-50 bg-muted/20" : "bg-background"}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <button
                            type="button"
                            onClick={() => toggleExcluded(i)}
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isExcluded ? "border-border bg-background" : "border-primary bg-primary text-primary-foreground"}`}
                            aria-label={isExcluded ? "勾选写入" : "取消写入"}
                          >
                            {!isExcluded && <CheckCircle2 className="h-3 w-3" />}
                          </button>
                          <Badge variant="secondary" className="text-[10px]">
                            {PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}
                          </Badge>
                          <input
                            value={page.title}
                            onChange={(e) => updateProposed(i, { title: e.target.value })}
                            disabled={isExcluded}
                            className="flex-1 text-sm font-medium bg-transparent outline-none focus:bg-muted/40 rounded px-1 py-0.5 disabled:cursor-not-allowed"
                          />
                        </div>
                        <textarea
                          value={page.content}
                          onChange={(e) => updateProposed(i, { content: e.target.value })}
                          disabled={isExcluded}
                          className="w-full min-h-30 max-h-70 p-2 text-xs leading-relaxed bg-muted/10 border border-border/60 rounded-md outline-none focus:ring-1 focus:ring-primary resize-y disabled:cursor-not-allowed"
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <Button size="sm" variant="ghost" onClick={runCompile} disabled={compiling}>
                    <RefreshCw className="h-3.5 w-3.5 mr-1" /> 重新编译
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving || selectedCount === 0}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                    确认写入维基（{selectedCount} 页）
                  </Button>
                </div>
              </>
            ) : proposed && proposed.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">这份定位方案暂无可编译内容。</p>
                <Button size="sm" variant="outline" onClick={runCompile} disabled={compiling}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" /> 重新编译
                </Button>
              </div>
            ) : null}
          </TabsContent>

          {/* ── 维基总览 + 体检 ── */}
          <TabsContent value="wiki" className="space-y-3 mt-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {wikiPages ? `当前 ${wikiPages.length} 页 active 维基` : "点击刷新加载已写入的维基页"}
              </p>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={loadWiki} disabled={loadingWiki || !projectId}>
                  {loadingWiki ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                  刷新
                </Button>
                <Button size="sm" variant="outline" onClick={runLint} disabled={linting || !projectId}>
                  {linting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                  运行体检
                </Button>
              </div>
            </div>

            {lintReport && (
              <div className="rounded-lg border p-3 space-y-2 bg-muted/10">
                <div className="flex items-center gap-2 flex-wrap">
                  {lintReport.passed ? (
                    <Badge className="bg-emerald-600 text-white text-[10px]">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> 体检通过
                    </Badge>
                  ) : (
                    <Badge className="bg-red-600 text-white text-[10px]">
                      <AlertTriangle className="h-3 w-3 mr-1" /> 有 {lintReport.errorCount} 项需修复
                    </Badge>
                  )}
                  {lintReport.warningCount > 0 && (
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-400">
                      {lintReport.warningCount} 项建议
                    </Badge>
                  )}
                </div>
                {lintReport.findings.length > 0 ? (
                  <ul className="space-y-1.5">
                    {lintReport.findings.map((f, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs">
                        {f.severity === "error" ? (
                          <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 shrink-0" />
                        ) : (
                          <span className="h-3.5 w-3.5 mt-0.5 shrink-0 flex items-center justify-center text-amber-500">•</span>
                        )}
                        <span className="text-muted-foreground">{f.message}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">无任何问题。</p>
                )}
              </div>
            )}

            {wikiPages && wikiPages.length > 0 ? (
              <div className="space-y-2">
                {wikiPages.map((page) => (
                  <div key={page.id} className="rounded-lg border p-3 bg-background">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {PAGE_TYPE_LABELS[page.pageType] ?? page.pageType}
                      </Badge>
                      <span className="text-sm font-medium">{page.title}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">v{page.version}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{page.content}</p>
                  </div>
                ))}
              </div>
            ) : wikiPages && wikiPages.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                还没有写入任何维基页。先去「编译确认」生成并写入。
              </p>
            ) : null}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
