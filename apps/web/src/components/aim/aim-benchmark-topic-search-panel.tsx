"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { AimBenchmarkTopicSearchResults } from "@/components/aim/aim-benchmark-topic-search-results"
import { useAimBenchmarkTopicSearch } from "@/features/aim/hooks/use-aim-benchmark-topic-search"

/** 对标选题搜索：仅由「+ → 搜对标选题」技能打开，不再常驻工作台。 */
export function AimBenchmarkTopicSearchPanel(props: {
  projectId?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const search = useAimBenchmarkTopicSearch(props.projectId)

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>搜市场上的对标选题</DialogTitle>
          <DialogDescription>
            复用市场洞察同一套搜索。搜到后可收藏进研究篮，或一键转成写稿事项。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              value={search.keyword}
              onChange={(event) => search.setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void search.search()
              }}
              placeholder="关键词：赛道 / 痛点 / 对标品类…"
              className="h-8 flex-1 text-xs"
              autoFocus
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
      </DialogContent>
    </Dialog>
  )
}
