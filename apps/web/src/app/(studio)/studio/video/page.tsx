import { Suspense } from "react"
import type { Metadata } from "next"
import { VideoWorkbench } from "@/features/studio/video-workbench"

export const metadata: Metadata = { title: "视频数字人 · 数字人工坊" }

export default function StudioVideoPage() {
  return (
    <Suspense fallback={null}>
      <VideoWorkbench />
    </Suspense>
  )
}
