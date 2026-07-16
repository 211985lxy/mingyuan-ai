import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { SmartImportEdit, SmartImportItem } from "./smart-import-types"

export function SmartImportPreviewItem(props: {
  item: SmartImportItem
  edit: SmartImportEdit
  expanded: boolean
  categories: Record<string, string>
  onEdit: (patch: SmartImportEdit) => void
  onToggleExpanded: () => void
}) {
  const { item, edit } = props
  const duplicate = !!item.duplicateOfId
  return <Card className={`border ${edit.skip ? "opacity-50" : duplicate ? "border-orange-200" : ""}`}>
    <CardContent className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">#{item.index + 1}</span>
          {item.detectedSource === "wechat_chat" && <Badge variant="outline" className="text-[10px]">微信记录</Badge>}
          <Badge variant={item.confidence === "high" ? "default" : item.confidence === "medium" ? "secondary" : "outline"} className="text-[10px]">
            {item.confidence === "high" ? "高置信" : item.confidence === "medium" ? "中置信" : "低置信"}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {duplicate && <Badge variant="outline" className="border-orange-300 text-[10px] text-orange-600">重复 {(item.duplicateScore! * 100).toFixed(0)}%</Badge>}
          <label className="flex cursor-pointer items-center gap-1 text-xs"><input type="checkbox" checked={!!edit.skip} onChange={(event) => props.onEdit({ skip: event.target.checked })} />跳过</label>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">标题</Label><Input value={edit.title ?? item.suggestedTitle} onChange={(event) => props.onEdit({ title: event.target.value })} className="h-8 text-sm" /></div>
        <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">分类</Label><Select value={edit.category ?? item.suggestedCategory} onValueChange={(value) => props.onEdit({ category: value ?? "" })}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(props.categories).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label className="text-[10px] text-muted-foreground">价值分级</Label><Select value={edit.valueGrade ?? item.suggestedValueGrade} onValueChange={(value) => props.onEdit({ valueGrade: value ?? "" })}><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger><SelectContent>{["S", "A", "B", "C"].map((grade) => <SelectItem key={grade} value={grade}>{grade}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div className="flex flex-wrap gap-1">{(edit.tags ?? item.suggestedTags ?? []).map((tag) => <Badge key={tag} variant="secondary" className="text-[10px]">{tag.replace("kb_scope:", "").replace("asset_role:", "").replace("usable_for:", "").replace("confidence:", "")}</Badge>)}</div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{edit.skip ? "(已跳过)" : item.suggestedKeyPoints}</p>
      <button className="cursor-pointer text-[10px] text-primary hover:underline" onClick={props.onToggleExpanded}>{props.expanded ? "收起原文" : "展开原文"}</button>
      {props.expanded && <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs text-muted-foreground">{item.originalText}</pre>}
    </CardContent>
  </Card>
}
