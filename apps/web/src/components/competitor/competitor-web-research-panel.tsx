"use client"

import { Loader2, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import type { WatchAccount } from "@/lib/api/client"
import { formatCompetitorAccountName } from "@/lib/competitor/display"
import type { ApiCompetitorWebResearch } from "@/types/api"

interface WebResearchPanelProps {
  activeAccount?: WatchAccount
  query: string
  loading: boolean
  result: ApiCompetitorWebResearch | null
  onQueryChange: (query: string) => void
  onResearch: () => Promise<void>
}

function ResearchResults({ result }: { result: ApiCompetitorWebResearch }) {
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">检索词：{result.query} · 通道：{result.availability.summary}</div>
      {result.warnings.length > 0 ? <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{result.warnings.join("；")}</p> : null}
      <div className="space-y-2">
        {result.items.map((item) => (
          <a key={item.url} href={item.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg border p-3 transition-colors hover:bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{item.source}</Badge>{item.publishedAt ? <span>{item.publishedAt}</span> : null}
            </div>
            <p className="mt-2 text-sm font-semibold text-foreground">{item.title}</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.snippet || "该结果未返回摘要，可直接打开原文查看。"}</p>
          </a>
        ))}
      </div>
    </div>
  )
}

export function CompetitorWebResearchPanel({ activeAccount, query, loading, result, onQueryChange, onResearch }: WebResearchPanelProps) {
  const accountName = activeAccount ? formatCompetitorAccountName(activeAccount) : ""
  return (
    <AiResultPanel title="全网补证" icon={<Search className="h-4 w-4 text-primary" />} meta={<span>使用 agent-reach 的公开 web / RSS 路径，先补真实外部线索</span>} flat>
      <div className="flex flex-col gap-3 lg:flex-row">
        <Input
          placeholder={activeAccount ? `例如：${accountName}` : "例如：供暖行业 老板IP / 某个账号名 / 某个细分主题"}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void onResearch()}
          disabled={loading}
          className="flex-1"
        />
        <div className="flex gap-2">
          {activeAccount ? <Button variant="outline" onClick={() => onQueryChange(accountName)} disabled={loading}>带入当前账号</Button> : null}
          <Button onClick={() => void onResearch()} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{loading ? "补证中..." : "开始补证"}
          </Button>
        </div>
      </div>
      {result ? <ResearchResults result={result} /> : (
        <p className="mt-3 rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">这里不替你直接下结论，只补公开网页线索。搜到的结果适合反喂给 AI 深度调查和后续选题判断。</p>
      )}
    </AiResultPanel>
  )
}
