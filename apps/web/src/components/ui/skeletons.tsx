import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * 结构化骨架屏：让加载态的形状贴合真实内容，避免「加载中…」这类
 * 无形状提示造成的布局跳动。全部基于 Skeleton（已接水墨流光）。
 */

/** 行式列表骨架：成片任务、配音历史等一行一条的场景。
 *  variant 需与真实行形态一致——成片任务是卡片，配音历史是轻量边框行，
 *  用错会让加载态比真实内容更重（出现「卡片套卡片」）。 */
export function ListSkeleton({
  rows = 4,
  withAction = true,
  variant = "card",
  className,
}: {
  rows?: number
  /** 每行右侧是否有操作按钮位 */
  withAction?: boolean
  variant?: "card" | "plain"
  className?: string
}) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, index) =>
        variant === "card" ? (
          <Card key={index}>
            <CardContent className="flex items-center justify-between gap-4 py-4">
              <ListRowBody withAction={withAction} />
            </CardContent>
          </Card>
        ) : (
          <div
            key={index}
            className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3"
          >
            <ListRowBody withAction={withAction} />
          </div>
        ),
      )}
    </div>
  )
}

function ListRowBody({ withAction }: { withAction: boolean }) {
  return (
    <>
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-2/3" />
      </div>
      {withAction ? <Skeleton className="h-7 w-20 shrink-0 rounded-lg" /> : null}
    </>
  )
}

/** 卡片网格骨架：素材库、模板、选题卡等网格布局。 */
export function CardGridSkeleton({
  count = 6,
  className,
}: {
  count?: number
  className?: string
}) {
  return (
    <div
      className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 py-4">
            <Skeleton className="h-24 w-full rounded-lg" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** 表格骨架：数据看板、用量、日志等表格式页面。 */
export function TableSkeleton({
  rows = 6,
  columns = 4,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      <div className="flex gap-4">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 py-2">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 详情/长文骨架：方法论详情、知识条目等标题 + 段落结构。 */
export function DetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-5", className)} aria-hidden>
      <Skeleton className="h-7 w-1/3" />
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="space-y-2.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-10/12" />
      </div>
    </div>
  )
}
