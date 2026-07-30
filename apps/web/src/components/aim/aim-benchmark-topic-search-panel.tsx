"use client"

import { useState } from "react"
import { ChevronDown, Loader2, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AimBenchmarkTopicSearchResults } from "@/components/aim/aim-benchmark-topic-search-results"
import { useAimBenchmarkTopicSearch } from "@/features/aim/hooks/use-aim-benchmark-topic-search"
import { cn } from "@/lib/utils"

export function AimBenchmarkTopicSearchPanel(props: {
  projectId?: string | null
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(Boolean(props.defaultOpen))
  const open = props.open ?? uncontrolledOpen
  const setOpen = props.onOpenChange ?? setUncontrolledOpen
  const search = useAimBenchmarkTopicSearch(props.projectId)

  return (
    <div className="mx-auto w-full max-w-3xl rounded-xl border border-border/70 bg-card/60">
      <button
        type="button"
        className="flex h-9 w-full items-center gap-2 px-3 text-left text-xs font-medium text-foreground"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <Search className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate">搜市场上的对标选题</span>
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="space-y-2 border-t border-border/60 px-3 pb-3 pt-2">
          <div className="flex gap-2">
            <Input
              value={search.keyword}
              onChange={(event) => search.setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search.search()
              }}
              placeholder="关键词：赛道 / 痛点 / 对标品类…"
              className="h-8 flex-1 text-xs"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 px-3"
              disabled={search.loading}
              onClick={() => void search.search()}
            >
              {search.loading ? <Loader2 className="size-3.5 animate-spin" /> : "搜索"}
            </Button>
          </div>
          {search.warnings.map((warning) => (
            <p key={warning} className="text-[11px] text-amber-700 dark:text-amber-300">{warning}</p>
          ))}
          <AimBenchmarkTopicSearchResults
            items={search.items}
            busyKey={search.busyKey}
            onSave={(item) => void search.save(item)}
            onWrite={(item) => void search.write(item)}
          />
        </div>
      ) : null}
    </div>
  )
}
