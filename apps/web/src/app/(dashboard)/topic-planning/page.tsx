"use client"

import Link from "next/link"
import { ExternalLink, Sparkles, Target } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { TopicCandidatesPanel } from "@/components/topic-planning/topic-candidates-panel"
import { TopicChatCard } from "@/components/topic-planning/topic-chat-card"
import {
  TopicDailyReportEmptyState,
  TopicDailyReportPanel,
} from "@/components/topic-planning/topic-daily-report"
import { TopicKnowledgePool } from "@/components/topic-planning/topic-knowledge-pool"
import type { TopicCategory } from "@/components/topic-planning/topic-knowledge-pool"
import { useTopicPlanning, MODE_META } from "@/features/topic/hooks/use-topic-planning"
import type { ApiTopicCard } from "@/types/api"

export default function TopicPlanningPage() {
  const w = useTopicPlanning()

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-10">
      <WorkbenchHero
        title="选题工作台"
        subtitle="先看今天该拍什么，再看为什么是它；不满意，再从备选里换。"
        badge={<Badge variant="secondary">{MODE_META[w.recommendationMode].label}</Badge>}
      />

      {!w.selectedProjectId ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Target className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm font-medium">先选择一个客户项目，再开始沉淀选题素材。</p>
            <p className="mt-1 text-xs text-muted-foreground">
              先把客户分开，后面的主推和备选才不会串味。
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-6">
            <div className="order-1 space-y-6">
              {w.dailyReport ? (
                <TopicDailyReportPanel report={w.dailyReport} />
              ) : w.recommendationMode === "daily" ? (
                <TopicDailyReportEmptyState
                  error={w.autoGenerateError}
                  onGenerate={w.handleGenerateTopics}
                  disabled={!w.selectedProjectId || w.isGenerating || w.autoGenerating}
                />
              ) : null}

              <AiResultPanel
                title="选题设置"
                icon={<Target className="h-4 w-4 text-primary" />}
                meta={<span>{MODE_META[w.recommendationMode].description}</span>}
                contentClassName="flex flex-wrap items-center justify-between gap-3 p-4"
                flat
              >
                <div className="flex flex-wrap items-center gap-2">
                  {Object.entries(MODE_META).map(([mode, meta]) => (
                    <Button
                      key={mode}
                      size="sm"
                      variant={w.recommendationMode === mode ? "default" : "outline"}
                      onClick={() => w.handleModeChange(mode as typeof w.recommendationMode)}
                    >
                      {meta.label}
                    </Button>
                  ))}
                  <Badge variant="outline">{w.selectedProject ? w.selectedProject.name : w.loadingProjects ? "正在读取全案" : "全案配置中"}</Badge>
                  <Badge variant="secondary">
                    {w.selectedKnowledgeIds.length > 0 ? `已选素材 ${w.selectedKnowledgeIds.length} 条` : `选题池 ${w.knowledgeEntries.length} 条`}
                  </Badge>
                  <Button
                    variant="outline"
                    onClick={w.handleGenerateTopics}
                    disabled={!w.selectedProjectId || w.isGenerating || w.autoGenerating}
                  >
                    <Sparkles className="mr-1 h-4 w-4" />
                    {w.isGenerating || w.autoGenerating ? "生成中..." : w.topicCards.length > 0 ? "重新生成" : `生成${MODE_META[w.recommendationMode].label}`}
                  </Button>
                </div>
              </AiResultPanel>

              <TopicCandidatesPanel
                cards={w.topicCards}
                selectedIndex={w.selectedTopicIndex}
                selectedKnowledgeLabels={w.selectedKnowledgeLabels}
                knowledgeCount={w.knowledgeEntries.length}
                autoGenerating={w.autoGenerating}
                onSelect={w.handleSelectTopic}
                onWrite={w.jumpToAim}
              />
            </div>

            <TopicChatCard
              value={w.topicChatInput}
              loading={w.topicChatLoading}
              disabled={!w.selectedProjectId}
              reply={w.topicChatReply}
              onChange={w.setTopicChatInput}
              onSubmit={w.handleTopicChatSubmit}
            />

            <TopicKnowledgePool
              entries={w.knowledgeEntries}
              selectedIds={w.selectedKnowledgeIds}
              forms={w.forms}
              loading={w.loadingKnowledge}
              savingCategory={w.savingCategory}
              onUpdateForm={w.updateForm}
              onCreate={(category: TopicCategory) => void w.handleCreateKnowledge(category)}
              onUpdate={w.handleUpdateKnowledge}
              onArchive={w.handleArchiveKnowledge}
              onToggle={w.toggleKnowledgeSelection}
            />

            <div className="order-5 grid gap-3 md:grid-cols-2">
              <Link href="/ai-hot" className="block">
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold text-foreground">全网热点洞察</p>
                      <p className="mt-1 text-sm text-muted-foreground">查看当天热点、行业信号和可用线索，再收进选题池。</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
              <Link href="/competitor" className="block">
                <Card className="h-full transition-colors hover:border-primary/40 hover:bg-muted/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="font-semibold text-foreground">竞品研究</p>
                      <p className="mt-1 text-sm text-muted-foreground">查看对标账号、爆款作品和趋势证据。</p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
