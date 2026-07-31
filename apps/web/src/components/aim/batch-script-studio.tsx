"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Sparkles, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CountControl,
  EmptyState,
  ErrorState,
  GeneratedScriptsView,
  LoadingState,
  type BatchTab,
  type GeneratedScriptView,
  type StructureOption,
  type StructureResult,
  ScriptInputArea,
  StructureResultView,
} from "@/components/aim/batch-script-studio-sections"

/** 批量文案工作室：三 Tab（提取结构 / 生成文案 / 一键串联）。
 *  由 content_producer 的「批量文案」技能组触发打开。 */
export function BatchScriptStudio(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialTab?: BatchTab
  projectId?: string | null
}) {
  const { open, onOpenChange, initialTab, projectId } = props
  const [tab, setTab] = useState<BatchTab>(initialTab ?? "extract")

  useEffect(() => {
    if (open && initialTab) setTab(initialTab)
  }, [open, initialTab])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="size-4" />
            批量文案工作室
          </DialogTitle>
          <DialogDescription>
            提取结构模板 → 结合知识库批量生成新文案。支持分步执行或一键串联。
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as BatchTab)} className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="extract" className="flex-1 text-xs">提取结构</TabsTrigger>
            <TabsTrigger value="generate" className="flex-1 text-xs">生成文案</TabsTrigger>
            <TabsTrigger value="pipeline" className="flex-1 text-xs">一键串联</TabsTrigger>
          </TabsList>

          <TabsContent value="extract" className="mt-3">
            <ExtractTab projectId={projectId ?? null} />
          </TabsContent>
          <TabsContent value="generate" className="mt-3">
            <GenerateTab projectId={projectId ?? null} />
          </TabsContent>
          <TabsContent value="pipeline" className="mt-3">
            <PipelineTab projectId={projectId ?? null} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

// ─── Tab 1: 提取结构 ──────────────────────────────────────

function ExtractTab(props: { projectId: string | null }) {
  const [text, setText] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [structure, setStructure] = useState<StructureResult | null>(null)

  const canSubmit = text.trim().length > 0 && !loading

  async function handleExtract() {
    setLoading(true)
    setError(null)
    setStructure(null)
    try {
      const res = await fetch("/api/aim/script-structures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, projectId: props.projectId || undefined }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "提取失败")
      setStructure(body.data.structure as StructureResult)
      toast.success("结构模板已提取并保存")
    } catch (err) {
      setError(err instanceof Error ? err.message : "提取失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <ScriptInputArea value={text} onChange={setText} />
      <Button onClick={() => void handleExtract()} disabled={!canSubmit} className="w-full">
        {loading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
        提取结构模板
      </Button>
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="正在分析文案并提炼结构…" /> : null}
      {structure && !loading ? <StructureResultView structure={structure} /> : null}
    </div>
  )
}

// ─── Tab 2: 生成文案 ──────────────────────────────────────

function GenerateTab(props: { projectId: string | null }) {
  const [structures, setStructures] = useState<StructureOption[]>([])
  const [selectedId, setSelectedId] = useState<string>("")
  const [count, setCount] = useState(3)
  const [topicTitle, setTopicTitle] = useState("")
  const [loadingList, setLoadingList] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scripts, setScripts] = useState<GeneratedScriptView[]>([])

  const loadStructures = useCallback(async () => {
    setLoadingList(true)
    try {
      const params = new URLSearchParams()
      if (props.projectId) params.set("projectId", props.projectId)
      const res = await fetch(`/api/aim/script-structures?${params}`)
      const body = await res.json()
      const list: StructureOption[] = body.data ?? []
      setStructures(list)
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id)
    } catch {
      setStructures([])
    } finally {
      setLoadingList(false)
    }
  }, [props.projectId, selectedId])

  useEffect(() => {
    void loadStructures()
  }, [loadStructures])

  async function handleGenerate() {
    if (!selectedId) {
      setError("请先选择一个结构模板")
      return
    }
    if (!props.projectId) {
      setError("请先在工作台选择一个项目，生成文案需要项目知识库")
      return
    }
    setGenerating(true)
    setError(null)
    setScripts([])
    try {
      const res = await fetch(`/api/aim/script-structures/${selectedId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, topicTitle: topicTitle || undefined, projectId: props.projectId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "生成失败")
      setScripts(body.data.scripts as GeneratedScriptView[])
      toast.success(`已生成 ${body.data.scripts.length} 条文案并保存到草稿箱`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">选择结构模板</Label>
        {loadingList ? (
          <LoadingState label="加载结构列表…" />
        ) : structures.length === 0 ? (
          <EmptyState message="还没有已提取的结构模板，先去「提取结构」Tab 创建一个" />
        ) : (
          <div className="space-y-1.5">
            {structures.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`w-full rounded-lg border p-2 text-left transition ${
                  selectedId === s.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"
                }`}
              >
                <p className="text-sm font-medium">{s.displayName}</p>
                {s.description ? (
                  <p className="text-[11px] text-muted-foreground">{s.description}</p>
                ) : null}
                <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                  来源 {s.sourceScriptsCount} 条文案
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">选题方向（可选）</Label>
        <Input
          value={topicTitle}
          onChange={(e) => setTopicTitle(e.target.value)}
          placeholder="如：新手妈妈夜间喂养痛点"
          className="h-8 text-sm"
        />
      </div>

      <CountControl value={count} onChange={setCount} />

      <Button
        onClick={() => void handleGenerate()}
        disabled={!selectedId || generating}
        className="w-full"
      >
        {generating ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Sparkles className="mr-1 size-4" />}
        生成 {count} 条文案
      </Button>

      {error ? <ErrorState message={error} /> : null}
      {generating ? <LoadingState label="正在结合知识库生成文案…" /> : null}
      {scripts.length > 0 && !generating ? (
        <GeneratedScriptsView scripts={scripts} />
      ) : null}
    </div>
  )
}

// ─── Tab 3: 一键串联 ──────────────────────────────────────

function PipelineTab(props: { projectId: string | null }) {
  const [text, setText] = useState("")
  const [count, setCount] = useState(3)
  const [topicTitle, setTopicTitle] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [structure, setStructure] = useState<StructureResult | null>(null)
  const [scripts, setScripts] = useState<GeneratedScriptView[]>([])

  const canSubmit = text.trim().length > 0 && !loading

  async function handlePipeline() {
    if (!props.projectId) {
      setError("请先在工作台选择一个项目，生成文案需要项目知识库")
      return
    }
    setLoading(true)
    setError(null)
    setStructure(null)
    setScripts([])
    try {
      const res = await fetch("/api/aim/script-structures/pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          count,
          topicTitle: topicTitle || undefined,
          projectId: props.projectId,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? "一键生成失败")
      setStructure(body.data.structure as StructureResult)
      setScripts(body.data.scripts as GeneratedScriptView[])
      toast.success(`结构已提取，已生成 ${body.data.scripts.length} 条文案`)
    } catch (err) {
      setError(err instanceof Error ? err.message : "一键生成失败")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <ScriptInputArea value={text} onChange={setText} />
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">选题方向（可选）</Label>
        <Input
          value={topicTitle}
          onChange={(e) => setTopicTitle(e.target.value)}
          placeholder="如：年底促销冲刺"
          className="h-8 text-sm"
        />
      </div>
      <CountControl value={count} onChange={setCount} />
      <Button onClick={() => void handlePipeline()} disabled={!canSubmit} className="w-full">
        {loading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Wand2 className="mr-1 size-4" />}
        一键提取 + 生成
      </Button>
      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState label="正在提取结构并生成文案…" /> : null}
      {structure && !loading ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">提取的结构模板</p>
          <StructureResultView structure={structure} />
        </div>
      ) : null}
      {scripts.length > 0 && !loading ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">生成的文案</p>
          <GeneratedScriptsView scripts={scripts} />
        </div>
      ) : null}
    </div>
  )
}
