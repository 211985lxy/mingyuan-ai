import Link from "next/link"
import { Bell, Clock3, ExternalLink, ListChecks } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"

const TASKS = [
  {
    name: "选题雷达",
    schedule: "每天 09:00",
    endpoint: "/api/cron/aihot-briefing",
    desc: "整理今日行业线索，作为选题工作台结合账号资料、对标账号、对标文案和资料库生成专属选题的参考。",
    status: "已接入",
  },
  {
    name: "抖音热点抓取",
    schedule: "按 cron 配置",
    endpoint: "/api/cron/douyin-hot",
    desc: "拉取抖音热榜快照，供选题雷达和选题判断使用。",
    status: "已接入",
  },
  {
    name: "市场热榜刷新",
    schedule: "按 cron 配置",
    endpoint: "/api/cron/market-hotlist",
    desc: "生成市场热点快照，合并进入选题雷达筛选。",
    status: "已接入",
  },
  {
    name: "旧数据清理",
    schedule: "低频清理",
    endpoint: "/api/cron/cleanup",
    desc: "清理过期热点和快照数据。",
    status: "已接入",
  },
]

export default function ScheduledTasksPage() {
  return (
    <div className="space-y-6 pb-10">
      <WorkbenchHero
        title="定时任务清单"
        subtitle="集中查看 AIM 后台已有的定时任务、选题线索和轮询任务。这里先做清单入口，不提供启停配置。"
        badge={<Badge variant="secondary">运营入口</Badge>}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/ai-hot" />}>
            <Bell className="h-4 w-4" />
            选题雷达
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TASKS.map((task) => (
          <Card key={task.endpoint} className="border-border/70">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-primary" />
                    {task.name}
                  </CardTitle>
                  <CardDescription>{task.desc}</CardDescription>
                </div>
                <Badge variant="outline">{task.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock3 className="h-4 w-4" />
                {task.schedule}
              </div>
              <code className="block rounded-md bg-muted px-2.5 py-2 text-xs text-muted-foreground">
                {task.endpoint}
              </code>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>需要确认真实执行频率时，以服务器 cron / 平台定时器配置为准。</span>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/hot-topics" />}>
            打开选题雷达
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
