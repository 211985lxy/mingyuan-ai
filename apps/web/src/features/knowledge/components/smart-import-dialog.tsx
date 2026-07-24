import { useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CATEGORY_LABELS,
  KNOWLEDGE_UPLOAD_ACCEPT,
  projectLabel,
  type AdminProject,
} from "@/features/knowledge/admin-knowledge-shared"

interface SmartImportItem {
  index: number
  originalText: string
  detectedSource: string
  suggestedTitle: string
  suggestedKeyPoints: string
  suggestedCategory: string
  suggestedTags: string[]
  suggestedValueGrade: string
  duplicateOfId?: string
  duplicateScore?: number
  confidence: string
}

interface SmartImportPreviewData {
  userId: string
  projectId: string | null
  processed: SmartImportItem[]
  fileNames: string[]
}

type SmartImportEdit = {
  title?: string
  category?: string
  tags?: string[]
  valueGrade?: string
  skip?: boolean
}

/**
 * @description smartimportdialog
 * @param options - 配置选项
 * @returns 无返回值
 */
export function SmartImportDialog({
  open,
  projectId,
  projects,
  onOpenChange,
  onProjectChange,
  onImported,
}: {
  open: boolean
  projectId: string
  projects: AdminProject[]
  onOpenChange: (open: boolean) => void
  onProjectChange: (projectId: string) => void
  onImported: () => void
}) {
  const [step, setStep] = useState<"upload" | "processing" | "preview">("upload")
  const [files, setFiles] = useState<File[]>([])
  const [previewData, setPreviewData] = useState<SmartImportPreviewData | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [edits, setEdits] = useState<Record<number, SmartImportEdit>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  function reset() {
    setStep("upload")
    setFiles([])
    setPreviewData(null)
    setEdits({})
    setExpanded(new Set())
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) reset()
    onOpenChange(nextOpen)
  }

  async function analyze() {
    if (files.length === 0) return
    setStep("processing")
    setEdits({})
    setPreviewData(null)
    try {
      const formData = new FormData()
      for (const file of files) formData.append("files", file)
      if (projectId !== "none") formData.append("projectId", projectId)

      const response = await fetch("/api/admin/knowledge/smart-import", {
        method: "POST",
        body: formData,
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "分析失败" }))
        throw new Error(error.error || "智能分析失败")
      }
      const data = await response.json()
      setPreviewData(data.data)
      setStep("preview")
    } catch (error) {
      toast.error(`智能分析失败：${error instanceof Error ? error.message : "未知错误"}`)
      setStep("upload")
    }
  }

  async function confirm() {
    if (!previewData) return
    setConfirming(true)
    try {
      const entries = (Array.isArray(previewData.processed) ? previewData.processed : [])
        .filter((item) => !edits[item.index]?.skip)
        .map((item) => {
          const edit = edits[item.index]
          return {
            title: edit?.title || item.suggestedTitle,
            content: item.originalText,
            category: edit?.category || item.suggestedCategory,
            tags: edit?.tags || item.suggestedTags,
            valueGrade: edit?.valueGrade || item.suggestedValueGrade,
          }
        })

      const response = await fetch("/api/admin/knowledge/smart-import/confirm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: previewData.userId,
          projectId: previewData.projectId,
          entries,
        }),
      })
      if (!response.ok) throw new Error("确认导入失败")
      await response.json().catch(() => null)
      handleOpenChange(false)
      toast.success(`已导入 ${entries.length} 条知识`)
      onImported()
    } catch (error) {
      toast.error(`导入失败：${error instanceof Error ? error.message : "未知错误"}`)
    } finally {
      setConfirming(false)
    }
  }

  const processed = Array.isArray(previewData?.processed) ? previewData.processed : []

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            智能导入
          </DialogTitle>
          <DialogDescription>上传文件，系统自动分类、打标签、去重</DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-4">
            <div>
              <Label>归属项目</Label>
              <Select value={projectId} onValueChange={(value) => onProjectChange(value ?? "none")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">全局方法论 / 不绑定项目</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{projectLabel(project)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>选择文件（支持 PDF / Word（.docx） / PPT / Excel / HTML / TXT / MD 等）</Label>
              <Input
                type="file"
                accept={KNOWLEDGE_UPLOAD_ACCEPT}
                multiple
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                className="mt-1 cursor-pointer"
              />
            </div>
            {files.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">已选 {files.length} 个文件：</p>
                <div className="flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {file.name} ({(file.size / 1024).toFixed(1)}KB)
                      <button className="ml-1 hover:text-destructive" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)} className="cursor-pointer">取消</Button>
              <Button onClick={analyze} disabled={files.length === 0} className="cursor-pointer">
                <Sparkles className="h-4 w-4 mr-1" />
                开始智能分析
              </Button>
            </div>
          </div>
        )}

        {step === "processing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在智能分析文件内容…</p>
            <div className="text-xs text-muted-foreground space-y-1">
              {files.map((file) => <p key={file.name}>{file.name}</p>)}
            </div>
          </div>
        )}

        {step === "preview" && previewData && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              共 {processed.length} 条知识待确认，可编辑标题/分类/分级，勾选跳过重复条目
            </p>
            <div className="space-y-3">
              {processed.map((item) => {
                const edit = edits[item.index] ?? {}
                const isDuplicate = !!item.duplicateOfId
                const isExpanded = expanded.has(item.index)
                return (
                  <Card key={item.index} className={`border ${edit.skip ? "opacity-50" : isDuplicate ? "border-orange-200" : ""}`}>
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">#{item.index + 1}</span>
                          {item.detectedSource === "wechat_chat" && <Badge variant="outline" className="text-[10px]">微信记录</Badge>}
                          <Badge variant={item.confidence === "high" ? "default" : item.confidence === "medium" ? "secondary" : "outline"} className="text-[10px]">
                            {item.confidence === "high" ? "高置信" : item.confidence === "medium" ? "中置信" : "低置信"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isDuplicate && (
                            <Badge variant="outline" className="text-[10px] text-orange-600 border-orange-300">
                              重复 {(item.duplicateScore! * 100).toFixed(0)}%
                            </Badge>
                          )}
                          <label className="flex items-center gap-1 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!edit.skip}
                              onChange={(event) => setEdits((current) => ({ ...current, [item.index]: { ...current[item.index], skip: event.target.checked } }))}
                            />
                            跳过
                          </label>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">标题</Label>
                          <Input
                            value={edit.title ?? item.suggestedTitle}
                            onChange={(event) => setEdits((current) => ({ ...current, [item.index]: { ...current[item.index], title: event.target.value } }))}
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">分类</Label>
                          <Select value={edit.category ?? item.suggestedCategory} onValueChange={(value) => setEdits((current) => ({ ...current, [item.index]: { ...current[item.index], category: value ?? "" } }))}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(CATEGORY_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[10px] text-muted-foreground">价值分级</Label>
                          <Select value={edit.valueGrade ?? item.suggestedValueGrade} onValueChange={(value) => setEdits((current) => ({ ...current, [item.index]: { ...current[item.index], valueGrade: value ?? "" } }))}>
                            <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="S">S · 战略级</SelectItem><SelectItem value="A">A · 战术级</SelectItem>
                              <SelectItem value="B">B · 参考级</SelectItem><SelectItem value="C">C · 索引级</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1">
                        {(edit.tags ?? item.suggestedTags ?? []).map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag.replace("kb_scope:", "").replace("asset_role:", "").replace("usable_for:", "").replace("confidence:", "")}</Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{edit.skip ? "(已跳过)" : item.suggestedKeyPoints}</p>
                      <button
                        className="text-[10px] text-primary hover:underline cursor-pointer"
                        onClick={() => setExpanded((current) => {
                          const next = new Set(current)
                          if (next.has(item.index)) next.delete(item.index)
                          else next.add(item.index)
                          return next
                        })}
                      >
                        {isExpanded ? "收起原文" : "展开原文"}
                      </button>
                      {isExpanded && <pre className="text-xs text-muted-foreground bg-muted/50 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">{item.originalText}</pre>}
                    </CardContent>
                  </Card>
                )
              })}
            </div>

            <div className="flex justify-between items-center pt-2">
              <span className="text-sm text-muted-foreground">
                将导入 {processed.filter((item) => !edits[item.index]?.skip).length} 条
              </span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep("upload")} className="cursor-pointer">重新选择</Button>
                <Button onClick={confirm} disabled={confirming || processed.every((item) => edits[item.index]?.skip)} className="cursor-pointer">
                  {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  确认导入
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
