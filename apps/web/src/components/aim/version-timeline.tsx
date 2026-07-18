"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { GitCompareArrows, History, Loader2, RotateCcw, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  getContentVersion,
  listContentVersions,
  restoreContentVersion,
  type ContentVersionSource,
  type ContentVersionSummary,
} from "@/lib/api/client"

// 版本来源中文标签
const SOURCE_LABELS: Record<ContentVersionSource, string> = {
  generated: "原始生成",
  manual_edit: "手动修改",
  ai_polish: "AI 润色",
  ai_proofread: "AI 校对",
  ai_imitate: "AI 仿写",
}

// ─── 行级 diff（LCS，自实现避免引入重型 diff 库） ──────────

type DiffLine = { type: "same" | "added" | "removed"; text: string }

/** 行级 LCS diff（导出以便单测；版本内容在几百行内，O(m*n) 可接受） */
export function diffLines(a: string, b: string): DiffLine[] {
  const aLines = a.split("\n")
  const bLines = b.split("\n")
  const m = aLines.length
  const n = bLines.length
  // LCS 动态规划表
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        aLines[i] === bLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const result: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (aLines[i] === bLines[j]) {
      result.push({ type: "same", text: aLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: aLines[i] })
      i++
    } else {
      result.push({ type: "added", text: bLines[j] })
      j++
    }
  }
  while (i < m) result.push({ type: "removed", text: aLines[i++] })
  while (j < n) result.push({ type: "added", text: bLines[j++] })
  return result
}

/**
 * 版本时间线面板：版本列表（版本号/来源/时间/预览）+ 两版 diff + 一键恢复。
 * 恢复 = 调 restore API 创建新版本后由 onRestore 把内容回填编辑器，历史不可变。
 */
export function VersionTimeline({
  generationId,
  conversationId,
  /** 外部创建新版本后递增，触发列表刷新 */
  refreshKey = 0,
  onRestore,
}: {
  generationId?: string
  conversationId?: string
  refreshKey?: number
  onRestore: (content: string) => void
}) {
  const [versions, setVersions] = useState<ContentVersionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [diffLinesState, setDiffLinesState] = useState<DiffLine[] | null>(null)
  const [diffTitle, setDiffTitle] = useState("")
  const [diffLoading, setDiffLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const scopeKey = generationId || conversationId || ""

  const load = useCallback(async () => {
    if (!scopeKey) return
    setLoading(true)
    try {
      const list = await listContentVersions(
        generationId ? { generationId } : { conversationId }
      )
      setVersions(list)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "版本列表加载失败")
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  function toggleSelect(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id)
      // 最多选两个版本用于对比；超过时替换最早选的那个
      return [...current, id].slice(-2)
    })
  }

  async function handleDiff() {
    if (selectedIds.length !== 2) {
      toast.error("请选择两个版本进行对比")
      return
    }
    setDiffLoading(true)
    try {
      // 列表按 versionNo 升序，旧版在左（removed），新版在右（added）
      const ordered = [...selectedIds].sort(
        (a, b) =>
          (versions.find((v) => v.id === a)?.versionNo ?? 0) -
          (versions.find((v) => v.id === b)?.versionNo ?? 0)
      )
      const [older, newer] = await Promise.all([
        getContentVersion(ordered[0]),
        getContentVersion(ordered[1]),
      ])
      setDiffLinesState(diffLines(older.content, newer.content))
      setDiffTitle(`v${older.versionNo} → v${newer.versionNo}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "版本对比失败")
    } finally {
      setDiffLoading(false)
    }
  }

  async function handleRestore(version: ContentVersionSummary) {
    setRestoringId(version.id)
    try {
      const restored = await restoreContentVersion(version.id)
      onRestore(restored.content)
      toast.success(`已恢复 v${version.versionNo} 的内容（存为新版本 v${restored.versionNo}）`)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复版本失败")
    } finally {
      setRestoringId(null)
    }
  }

  function formatTime(value: string) {
    const date = new Date(value)
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
  }

  if (!scopeKey) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        当前内容还没有关联生成记录，生成或保存后这里会显示版本历史。
      </div>
    )
  }

  // diff 视图
  if (diffLinesState) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">版本对比 {diffTitle}</span>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDiffLinesState(null)}>
            <X className="h-3.5 w-3.5" />
            返回列表
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-md border bg-background p-2 font-mono text-xs leading-5">
          {diffLinesState.map((line, index) => (
            <div
              key={index}
              className={cn(
                "whitespace-pre-wrap break-all px-1",
                line.type === "added" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                line.type === "removed" && "bg-red-500/10 text-red-600 line-through dark:text-red-400"
              )}
            >
              {line.type === "added" ? "+ " : line.type === "removed" ? "- " : "  "}
              {line.text}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          <History className="h-3.5 w-3.5" />
          版本历史（{versions.length}）
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={selectedIds.length !== 2 || diffLoading}
          onClick={handleDiff}
          title="选择两个版本后对比差异"
        >
          {diffLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitCompareArrows className="h-3.5 w-3.5" />}
          对比
        </Button>
      </div>
      {loading && versions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          加载中…
        </div>
      ) : versions.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          还没有版本记录，保存或执行 AI 操作后会自动生成。
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
          {[...versions].reverse().map((version) => (
            <div
              key={version.id}
              className={cn(
                "cursor-pointer rounded-md border px-2 py-1.5 text-xs transition-colors hover:bg-muted/50",
                selectedSet.has(version.id) && "border-primary/50 bg-primary/5"
              )}
              onClick={() => toggleSelect(version.id)}
              title="点击选择两个版本进行对比"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  v{version.versionNo}
                  <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                    {SOURCE_LABELS[version.source] || version.source}
                  </span>
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {formatTime(version.createdAt)} · {version.contentLength}字
                </span>
              </div>
              <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{version.preview}</p>
              <div className="mt-1 flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  disabled={restoringId === version.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    void handleRestore(version)
                  }}
                >
                  {restoringId === version.id ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RotateCcw className="h-3 w-3" />
                  )}
                  恢复此版本
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
