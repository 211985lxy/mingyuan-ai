import { Suspense } from "react"
import type { Metadata } from "next"
import { AudioWorkbench } from "@/features/studio/audio-workbench"

export const metadata: Metadata = { title: "音频数字人 · 数字人工坊" }

export default function StudioAudioPage() {
  return (
    <Suspense fallback={null}>
      <AudioWorkbench />
    </Suspense>
  )
}
