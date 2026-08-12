"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

import { WeeklyContentBoard } from "@/features/aim/components/weekly-content-board"
import type { WeeklyContentBoardItem } from "@/lib/aim/weekly-content-board"

export function ProjectWeeklyContent({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [items, setItems] = useState<WeeklyContentBoardItem[]>([])
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/aim/weekly-content?projectId=${encodeURIComponent(projectId)}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("weekly content unavailable")))
      .then((body: { items?: WeeklyContentBoardItem[] }) => setItems(body.items ?? []))
      .catch((error) => { if (error instanceof Error && error.name !== "AbortError") setItems([]) })
    return () => controller.abort()
  }, [projectId])
  if (!items.length) return null
  return (
    <div className="max-h-56 overflow-y-auto border-b bg-muted/10 px-3 py-2 sm:px-5">
      <p className="mb-2 text-xs font-medium">本周内容</p>
      <WeeklyContentBoard projectId={projectId} items={items} onOpen={(href) => router.push(href)} />
    </div>
  )
}
