"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { MoreHorizontal, Trash2 } from "lucide-react"
import { toast } from "sonner"
import {
  SidebarMenuSub,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  formatHistoryDate,
  formatHistoryTitle,
  resolveHistoryNavAgentId,
  type AimHistoryListItem,
} from "@/lib/aim-sidebar-history"
import type { AimAgentId } from "@/lib/aim-ui-config"
import { buildAimAgentNavHref } from "@/lib/aim/task-session-reset"

type AimExpertSidebarHistoryProps = {
  agentId: AimAgentId
  items: AimHistoryListItem[]
  isAimRoute: boolean
  currentAgentParam: string | null
  onCloseMobile: () => void
  onRequestLoad: (id: string) => void
  onDelete: (id: string) => Promise<void>
}

async function handleDeleteHistory(
  onDelete: (id: string) => Promise<void>,
  id: string,
  title: string,
) {
  if (!window.confirm(`删除这条任务？\n${title}`)) return
  try {
    await onDelete(id)
    toast.success("已删除")
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "删除失败")
  }
}

/**
 * 专家下的最近任务子列表（含删除）。
 */
export function AimExpertSidebarHistory({
  agentId,
  items,
  isAimRoute,
  currentAgentParam,
  onCloseMobile,
  onRequestLoad,
  onDelete,
}: AimExpertSidebarHistoryProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  return (
    <SidebarMenuSub className="mx-2 mb-1 border-l border-border/50">
      {items.length === 0 ? (
        <SidebarMenuSubItem>
          <p className="px-2 py-1.5 text-xs text-muted-foreground">暂无任务</p>
        </SidebarMenuSubItem>
      ) : (
        items.map((item) => {
          const title = formatHistoryTitle(item)
          const date = formatHistoryDate(item.createdAt)
          return (
            <SidebarMenuSubItem key={item.id}>
              <div className="group/item relative flex items-start rounded-md text-xs text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground">
                <button
                  type="button"
                  onClick={() => {
                    const navAgent = resolveHistoryNavAgentId(item.agentId, agentId)
                    onRequestLoad(item.id)
                    if (!isAimRoute || currentAgentParam !== navAgent) {
                      router.push(buildAimAgentNavHref({
                        currentSearch: searchParams?.toString() ?? "",
                        agentId: navAgent,
                      }))
                    }
                    onCloseMobile()
                  }}
                  className="min-w-0 flex-1 px-2 py-1.5 pr-7 text-left"
                  title={title}
                >
                  <span className="line-clamp-2 break-words leading-snug">{title}</span>
                  {date ? (
                    <span className="mt-0.5 block text-[10px] leading-none text-muted-foreground">
                      {date}
                    </span>
                  ) : null}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="absolute right-0.5 top-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm opacity-0 hover:bg-foreground/[0.06] group-hover/item:opacity-100"
                    aria-label="更多操作"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-28">
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void handleDeleteHistory(onDelete, item.id, title)}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SidebarMenuSubItem>
          )
        })
      )}
    </SidebarMenuSub>
  )
}
