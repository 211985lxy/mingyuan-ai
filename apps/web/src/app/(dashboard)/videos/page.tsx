"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { listVideoTasks } from "@/lib/api/client"
import type { ApiVideoTask } from "@/types/api"

const STATUS_LABEL: Record<string, string> = {
  pending: "排队中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
}

export default function VideosPage() {
  const [tasks, setTasks] = useState<ApiVideoTask[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setTasks(await listVideoTasks())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "成片列表加载失败")
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">我的成片</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            数字人生成任务列表。也可在作品编辑成稿下方点「用数字人生成视频」。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            刷新
          </Button>
          <Button size="sm" onClick={() => { window.location.href = "/assets" }}>
            去资产库
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">加载中…</p>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="space-y-3 py-10 text-center text-sm text-muted-foreground">
            <p>还没有成片任务。</p>
            <p>
              先在 <Link className="text-primary underline-offset-2 hover:underline" href="/assets">资产库</Link> 准备数字人，再回作品编辑出片。
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Card key={task.id}>
              <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{task.avatarName || "数字人口播"}</p>
                    <Badge variant="secondary">{STATUS_LABEL[task.status] ?? task.status}</Badge>
                  </div>
                  <p className="line-clamp-2 text-sm text-muted-foreground">{task.scriptContent}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(task.createdAt).toLocaleString("zh-CN")}
                    {task.errorMessage ? ` · ${task.errorMessage}` : ""}
                  </p>
                </div>
                {task.status === "completed" && task.videoUrl ? (
                  <Button
                    size="sm"
                    onClick={() => window.open(task.videoUrl!, "_blank", "noopener,noreferrer")}
                  >
                    打开成片
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
