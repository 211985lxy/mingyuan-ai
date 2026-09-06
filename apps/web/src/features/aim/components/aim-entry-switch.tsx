"use client"

import { MessageCircle, Workflow } from "lucide-react"
import { useRouter } from "next/navigation"

import { Button } from "@/components/ui/button"

interface AimEntryProject {
  id: string
  name: string
  status: string
}

export function AimEntrySwitch(props: {
  projects: AimEntryProject[]
  selectedProjectId?: string
  onFlexible?: () => void
  onOperating?: (projectId: string) => void
}) {
  const { projects } = props
  const router = useRouter()
  const onFlexible = props.onFlexible ?? (() => router.replace("/aim?mode=quick"))
  const onOperating = props.onOperating ?? ((selectedProjectId: string) => {
    router.replace(`/aim?projectId=${encodeURIComponent(selectedProjectId)}&stage=direction`)
  })
  // The server returns at most the account-bound project. Never offer a
  // project picker here: an AIM login account has one fixed project context.
  const boundProject = props.selectedProjectId
    ? projects.find((project) => project.id === props.selectedProjectId)
    : projects.length === 1
      ? projects[0]
      : undefined
  const projectId = boundProject?.id || ""

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-y-auto px-4 py-10">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <p className="text-xs font-medium text-primary">明远 AIM</p>
          <h1 className="text-2xl font-semibold tracking-tight">今天想怎么用 AIM？</h1>
          <p className="text-sm text-muted-foreground">自由问答随时可用，明确的经营任务也可进入 IP 闭环。</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto items-start justify-start gap-3 p-5 text-left"
            aria-label="Directly ask AIM"
            onClick={onFlexible}
          >
            <MessageCircle className="mt-0.5 size-5 text-primary" />
            <span><strong className="block">直接问 AIM</strong><span className="mt-1 block whitespace-normal text-xs font-normal text-muted-foreground">通用聊天、写作、修改和一次性任务</span></span>
          </Button>
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-start gap-3">
              <Workflow className="mt-0.5 size-5 text-primary" />
              <div><strong className="text-sm">运行 IP 闭环</strong><p className="mt-1 text-xs text-muted-foreground">定方向、做内容、发布、看结果</p></div>
            </div>
            <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              当前绑定项目：{boundProject?.name || "尚未完成项目绑定"}
            </p>
            <Button type="button" className="w-full" aria-label="Run IP loop" disabled={!projectId} onClick={() => onOperating(projectId)}>进入本周经营</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
