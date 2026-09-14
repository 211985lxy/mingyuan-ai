import type { Metadata } from "next"
import { WorksView } from "@/features/studio/works-view"

export const metadata: Metadata = { title: "作品 · 数字人工坊" }

export default function StudioWorksPage() {
  return <WorksView />
}
