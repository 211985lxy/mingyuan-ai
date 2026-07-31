"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"
import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { getAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import type { AimHistoryListItem } from "@/lib/aim-sidebar-history"
import { AimExpertSidebarHistory } from "@/components/layout/aim-expert-sidebar-history"

type AimExpertSidebarSectionProps = {
  agentId: AimAgentId
  active: boolean
  open: boolean
  items: AimHistoryListItem[]
  isAimRoute: boolean
  currentAgentParam: string | null
  onToggle: () => void
  onExpandAndNavigate: () => void
  onCloseMobile: () => void
  onRequestLoad: (id: string) => void
  onDelete: (id: string) => Promise<void>
}

/**
 * 侧栏单个专家：标题行 + 可折叠最近任务。
 */
export function AimExpertSidebarSection({
  agentId,
  active,
  open,
  items,
  isAimRoute,
  currentAgentParam,
  onToggle,
  onExpandAndNavigate,
  onCloseMobile,
  onRequestLoad,
  onDelete,
}: AimExpertSidebarSectionProps) {
  const agent = getAimAgent(agentId)
  const Icon = agent.icon
  const label = agent.displayTitle ?? agent.title

  return (
    <SidebarMenuItem>
      <div className="flex w-full items-center gap-0.5">
        <button
          type="button"
          aria-label={open ? `收起${label}最近任务` : `展开${label}最近任务`}
          aria-expanded={open}
          onClick={onToggle}
          className="flex h-8 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary/60 hover:text-foreground group-data-[collapsible=icon]:hidden"
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform duration-150",
              open && "rotate-90",
            )}
          />
        </button>
        <SidebarMenuButton
          render={(
            <Link
              href={`/aim?agent=${agent.id}`}
              onClick={onExpandAndNavigate}
            />
          )}
          isActive={active}
          tooltip={label}
          className={cn(
            "h-10 min-w-0 flex-1 rounded-md px-2 text-sm font-normal md:h-9",
            active
              ? "bg-primary/10 font-medium text-primary"
              : "text-foreground/75 hover:bg-secondary/60 hover:text-foreground",
          )}
        >
          <Icon className="h-4 w-4 opacity-70" />
          <span className="truncate">{label}</span>
        </SidebarMenuButton>
      </div>

      {open ? (
        <AimExpertSidebarHistory
          agentId={agentId}
          items={items}
          isAimRoute={isAimRoute}
          currentAgentParam={currentAgentParam}
          onCloseMobile={onCloseMobile}
          onRequestLoad={onRequestLoad}
          onDelete={onDelete}
        />
      ) : null}
    </SidebarMenuItem>
  )
}
