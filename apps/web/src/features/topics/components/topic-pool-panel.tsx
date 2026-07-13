import Link from "next/link"
import { ExternalLink, Plus, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { KnowledgeEntryCard } from "@/features/topics/components/knowledge-entry-card"
import { CATEGORY_META, CATEGORY_ORDER, type TopicCategory } from "@/features/topics/topic-planning-config"
import type { KnowledgeEntry, TopicChatResponse } from "@/lib/api/client"

export type TopicKnowledgeForms = Record<TopicCategory, { title: string; content: string }>

export function TopicPoolPanel({
  topicChatInput,
  topicChatLoading,
  topicChatReply,
  knowledgeEntries,
  forms,
  savingCategory,
  loadingKnowledge,
  selectedKnowledgeIds,
  onTopicChatInputChange,
  onTopicChatSubmit,
  onFormChange,
  onCreateKnowledge,
  onToggleKnowledge,
  onUpdateKnowledge,
  onArchiveKnowledge,
}: {
  topicChatInput: string
  topicChatLoading: boolean
  topicChatReply: TopicChatResponse | null
  knowledgeEntries: KnowledgeEntry[]
  forms: TopicKnowledgeForms
  savingCategory: TopicCategory | null
  loadingKnowledge: boolean
  selectedKnowledgeIds: string[]
  onTopicChatInputChange: (value: string) => void
  onTopicChatSubmit: () => void
  onFormChange: (category: TopicCategory, field: "title" | "content", value: string) => void
  onCreateKnowledge: (category: TopicCategory) => void
  onToggleKnowledge: (entryId: string) => void
  onUpdateKnowledge: (entryId: string, data: { title: string; content: string }) => Promise<void>
  onArchiveKnowledge: (entryId: string) => Promise<void>
}) {
  const groupedEntries = CATEGORY_ORDER.map((category) => ({
    category,
    items: knowledgeEntries.filter((entry) => entry.category === category),
  }))

  return (
    <>
      <Card className="order-3 border-primary/20 bg-primary/[0.02]">
        <CardHeader className="pb-3">
          <CardTitle>临时想法</CardTitle>
          <CardDescription>丢一句客户问题、现场灵感或对标观察，先整理出方向。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={topicChatInput}
            placeholder="比如：今天客户又问我为什么报价比别人高"
            className="min-h-24"
            onChange={(event) => onTopicChatInputChange(event.target.value)}
          />
          <div className="flex justify-end">
            <Button onClick={onTopicChatSubmit} disabled={topicChatLoading}>
              <Sparkles className="mr-1 h-4 w-4" />
              {topicChatLoading ? "整理中..." : "整理成方向"}
            </Button>
          </div>
          {topicChatReply ? (
            <div className="rounded-lg border bg-background p-3 text-sm leading-6">
              <p className="font-medium">{topicChatReply.reply.summary}</p>
              <p className="mt-2"><b>优先方向：</b>{topicChatReply.reply.recommendedTitle}</p>
              <p><b>开头：</b>{topicChatReply.reply.opening}</p>
              {topicChatReply.reply.alternatives.length > 0 ? <p><b>备选角度：</b>{topicChatReply.reply.alternatives.join("、")}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="order-4 rounded-xl border bg-muted/20 p-3 text-sm opacity-80">
        <div className="font-medium text-muted-foreground">选题池 {knowledgeEntries.length} 条</div>
        <div className="mt-4 space-y-4">
          {groupedEntries.map(({ category, items }) => (
            <Card key={category} className="shadow-none">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle>{CATEGORY_META[category].label}</CardTitle>
                    <CardDescription>{CATEGORY_META[category].description}</CardDescription>
                  </div>
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
                    <div className="space-y-2">
                      <Label>标题</Label>
                      <Input value={forms[category].title} placeholder={CATEGORY_META[category].titlePlaceholder} onChange={(event) => onFormChange(category, "title", event.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>内容</Label>
                      <Textarea value={forms[category].content} placeholder={CATEGORY_META[category].contentPlaceholder} className="min-h-28" onChange={(event) => onFormChange(category, "content", event.target.value)} />
                    </div>
                    <div className="flex justify-end">
                      <Button onClick={() => onCreateKnowledge(category)} disabled={savingCategory === category}>
                        <Plus className="mr-1 h-4 w-4" />
                        {savingCategory === category ? "保存中..." : "加入选题池"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 border-t pt-4">
                  {loadingKnowledge ? (
                    <p className="text-sm text-muted-foreground">正在读取项目素材...</p>
                  ) : items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {category === "user_insight"
                        ? "还没有沉淀到用户洞察。客户多聊几轮后，可以从对话里提炼出来。"
                        : "这个分类还没有素材，先录一条，后面生成选题时就能直接带进去。"}
                    </p>
                  ) : items.map((entry) => (
                    <KnowledgeEntryCard
                      key={entry.id}
                      entry={entry}
                      selected={selectedKnowledgeIds.includes(entry.id)}
                      onToggleSelected={() => onToggleKnowledge(entry.id)}
                      onSave={(data) => onUpdateKnowledge(entry.id, data)}
                      onArchive={() => onArchiveKnowledge(entry.id)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="order-5 grid gap-3 md:grid-cols-2">
        <SourceLink href="/ai-hot" title="全网热点洞察" description="查看当天热点、行业信号和可用线索，再收进选题池。" />
        <SourceLink href="/competitor" title="竞品研究" description="查看对标账号、爆款作品和趋势证据。" />
      </div>
    </>
  )
}

function SourceLink({ href, title, description }: { href: string; title: string; description: string }) {
  return (
    <Link href={href} className="block">
      <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
        <CardContent className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </CardContent>
      </Card>
    </Link>
  )
}
