import { Loader2, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { MarkdownRenderer } from "@/components/markdown-renderer"
import {
  CATEGORY_LABELS,
  SOURCE_TYPE_LABELS,
  type DistillResult,
  type KnowledgeEntry,
} from "@/features/knowledge/admin-knowledge-shared"

export function KnowledgeDetailDialog({
  entry,
  onClose,
}: {
  entry: KnowledgeEntry | null
  onClose: () => void
}) {
  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry?.title ?? "知识详情"}</DialogTitle>
          <DialogDescription>
            {entry?.project?.name ?? "全局/未绑定"} · {entry?.user?.email ?? "未知用户"}
          </DialogDescription>
        </DialogHeader>
        {entry && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{CATEGORY_LABELS[entry.category] || entry.category}</Badge>
              <Badge variant="outline">{SOURCE_TYPE_LABELS[entry.sourceType] || entry.sourceType}</Badge>
              <Badge variant={entry.status === "active" ? "default" : "secondary"}>
                {entry.status === "active" ? "生效" : "已归档"}
              </Badge>
              {entry.valueGrade ? <Badge variant="outline">{entry.valueGrade}</Badge> : null}
            </div>
            <div className="rounded-lg border bg-muted/30 p-4">
              <MarkdownRenderer content={entry.content} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function KnowledgeDistillDialog({
  open,
  loading,
  result,
  onOpenChange,
}: {
  open: boolean
  loading: boolean
  result: DistillResult | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            知识蒸馏分析
          </DialogTitle>
          <DialogDescription>基于 DeepSeek 对选中知识的优化建议</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">正在分析知识条目...</p>
          </div>
        ) : result ? (
          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-3">精炼建议</h3>
              <div className="space-y-3">
                {result.distilled.map((item, index) => (
                  <Card key={index}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant={item.action === "keep" ? "default" : item.action === "merge" ? "secondary" : "outline"}>
                          {item.action === "keep" ? "保留" : item.action === "merge" ? "合并" : "归档"}
                        </Badge>
                        <Badge variant="outline">{item.suggestedCategory}</Badge>
                      </div>
                      <p className="font-medium">{item.suggestedTitle}</p>
                      <p className="text-sm text-muted-foreground">{item.suggestedContent}</p>
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {result.duplicates.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">可能的重复条目</h3>
                <div className="space-y-1">
                  {result.duplicates.map((pair, index) => (
                    <p key={index} className="text-sm text-muted-foreground">
                      条目 #{pair[0]} 和 #{pair[1]} 可能重复
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">优化建议</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{result.suggestions}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-destructive">分析失败，请重试</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
