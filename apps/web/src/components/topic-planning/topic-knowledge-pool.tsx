"use client"

import { Plus } from "lucide-react"

import { KnowledgeEntryCard } from "@/components/topic-planning/knowledge-entry-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { KnowledgeEntry } from "@/lib/api/client"

export type TopicCategory = "daily_inspiration" | "meeting_minutes" | "benchmark_reference" | "user_insight"

export const TOPIC_CATEGORY_META: Record<TopicCategory, {
  label: string
  description: string
  titlePlaceholder: string
  contentPlaceholder: string
}> = {
  daily_inspiration: {
    label: "日常灵感",
    description: "老板随口一句、客户现场一句话、想到的切入角度，都先收进来。",
    titlePlaceholder: "例如：老板晨会金句",
    contentPlaceholder: "记录原话、场景或你想到的选题切口。",
  },
  meeting_minutes: {
    label: "会议纪要",
    description: "把客户访谈、内部复盘、项目会议纪要粘贴进来，提炼真实问题和可拍选题。",
    titlePlaceholder: "例如：7月客户复盘会",
    contentPlaceholder: "粘贴会议纪要、访谈记录、讨论要点。保留原话、问题、分歧、案例和下一步动作。",
  },
  benchmark_reference: {
    label: "参考素材",
    description: "人工粘贴优质账号链接、爆款标题、开头方式或结构拆解。",
    titlePlaceholder: "例如：某优质账号爆款开头",
    contentPlaceholder: "贴链接、标题、开头文案，或你观察到的结构节奏。",
  },
  user_insight: {
    label: "用户洞察",
    description: "来自客户在选题策划和总聊天框里的真实输入，系统沉淀后再进入选题。",
    titlePlaceholder: "",
    contentPlaceholder: "",
  },
}

export const TOPIC_CATEGORY_ORDER: TopicCategory[] = [
  "daily_inspiration",
  "meeting_minutes",
  "benchmark_reference",
  "user_insight",
]

interface TopicKnowledgePoolProps {
  entries: KnowledgeEntry[]
  selectedIds: string[]
  forms: Record<TopicCategory, { title: string; content: string }>
  loading: boolean
  savingCategory: TopicCategory | null
  onUpdateForm: (category: TopicCategory, field: "title" | "content", value: string) => void
  onCreate: (category: TopicCategory) => void
  onUpdate: (entryId: string, data: { title: string; content: string }) => Promise<void>
  onArchive: (entryId: string) => Promise<void>
  onToggle: (entryId: string) => void
}

function TopicCategorySection({
  category,
  items,
  props,
}: {
  category: TopicCategory
  items: KnowledgeEntry[]
  props: TopicKnowledgePoolProps
}) {
  const meta = TOPIC_CATEGORY_META[category]
  return (
    <Card className="shadow-none">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-3">
          <div><CardTitle>{meta.label}</CardTitle><CardDescription>{meta.description}</CardDescription></div>
          <Badge variant="secondary">{items.length} 条</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {category === "user_insight" ? (
          <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-sm text-muted-foreground">
            客户在选题策划或总聊天框里提到的偏好、顾虑和真实问题，会沉淀到这里。
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="space-y-2"><Label>标题</Label><Input value={props.forms[category].title} placeholder={meta.titlePlaceholder} onChange={(event) => props.onUpdateForm(category, "title", event.target.value)} /></div>
            <div className="space-y-2"><Label>内容</Label><Textarea value={props.forms[category].content} placeholder={meta.contentPlaceholder} className="min-h-28" onChange={(event) => props.onUpdateForm(category, "content", event.target.value)} /></div>
            <div className="flex justify-end">
              <Button onClick={() => props.onCreate(category)} disabled={props.savingCategory === category}>
                <Plus className="mr-1 h-4 w-4" />{props.savingCategory === category ? "保存中..." : "加入选题池"}
              </Button>
            </div>
          </div>
        )}
        <div className="space-y-3 border-t pt-4">
          {props.loading ? (
            <p className="text-sm text-muted-foreground">正在读取项目素材...</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{category === "user_insight" ? "还没有沉淀到用户洞察。客户多聊几轮后，可以从对话里提炼出来。" : "这个分类还没有素材，先录一条，后面生成选题时就能直接带进去。"}</p>
          ) : items.map((entry) => (
            <KnowledgeEntryCard
              key={entry.id}
              entry={entry}
              selected={props.selectedIds.includes(entry.id)}
              onToggleSelected={() => props.onToggle(entry.id)}
              onSave={(data) => props.onUpdate(entry.id, data)}
              onArchive={() => props.onArchive(entry.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function TopicKnowledgePool(props: TopicKnowledgePoolProps) {
  return (
    <div className="order-4 rounded-xl border bg-muted/20 p-3 text-sm opacity-80">
      <div className="font-medium text-muted-foreground">选题池 {props.entries.length} 条</div>
      <div className="mt-4 space-y-4">
        {TOPIC_CATEGORY_ORDER.map((category) => (
          <TopicCategorySection key={category} category={category} items={props.entries.filter((entry) => entry.category === category)} props={props} />
        ))}
      </div>
    </div>
  )
}
