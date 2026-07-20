import { ChevronDown, ChevronUp, Loader2, Plus, Save, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { KIND_COLORS, KIND_LABELS, type EditableProfileItem } from "@/features/benchmark-profiles/model"
import { cn } from "@/lib/utils"

/**
 * @description profilematerials
 * @param options - 配置选项
 * @param field - 字段
 * @param value - 值
 * @returns 无返回值
 */
export function ProfileMaterials({ items, expandedIds, savingIds, onAdd, onToggle, onUpdate, onSave, onDelete }: { items: EditableProfileItem[]; expandedIds: Set<string>; savingIds: Set<string>; onAdd: () => void; onToggle: (id: string) => void; onUpdate: (id: string, field: "title" | "content" | "kind", value: string) => void; onSave: (id: string) => void; onDelete: (id: string) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">素材资料（{items.length} 条）</h2><Button variant="outline" size="sm" onClick={onAdd}><Plus className="mr-1 h-4 w-4" />添加素材</Button></div>
      {items.length === 0 ? <Card><CardContent className="flex flex-col items-center justify-center py-10 text-center"><p className="text-sm text-muted-foreground">暂无素材。可点击「添加素材」手动添加，或使用「一键拉取」导入竞品分析。</p></CardContent></Card> : items.map((item) => {
        const expanded = expandedIds.has(item.id)
        const saving = savingIds.has(item.id)
        return <Card key={item.id}><CardContent className="p-0"><button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/40" onClick={() => onToggle(item.id)}><div className="flex min-w-0 items-center gap-2">{expanded ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}<Badge variant="outline" className={cn("shrink-0 text-[10px]", KIND_COLORS[item.kind])}>{KIND_LABELS[item.kind] ?? item.kind}</Badge><span className="truncate text-sm font-medium">{item.title}</span>{item.content ? <span className="shrink-0 text-xs text-muted-foreground">{item.content.length} 字</span> : null}</div></button>{expanded ? <div className="space-y-3 border-t px-4 pb-4 pt-3"><div className="space-y-2"><Label className="text-xs">标题</Label><Input className="h-9 text-sm" value={item.title} onChange={(event) => onUpdate(item.id, "title", event.target.value)} /></div><div className="space-y-2"><Label className="text-xs">类型</Label><Select value={item.kind} onValueChange={(value) => { if (value) onUpdate(item.id, "kind", value) }}><SelectTrigger className="h-9 w-[140px] text-sm"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(KIND_LABELS).map(([key, label]) => <SelectItem key={key} value={key}>{label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-xs">内容</Label><Textarea className="min-h-32 text-sm" value={item.content} onChange={(event) => onUpdate(item.id, "content", event.target.value)} /></div><div className="flex items-center gap-2"><Button size="sm" onClick={() => onSave(item.id)} disabled={saving || !item.content.trim()}>{saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}保存此条</Button><Button variant="ghost" size="sm" onClick={() => onDelete(item.id)} className="text-destructive hover:text-destructive"><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button></div></div> : null}</CardContent></Card>
      })}
    </div>
  )
}
