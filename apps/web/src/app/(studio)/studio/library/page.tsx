import type { Metadata } from "next"
import { StudioLibraryView } from "@/features/studio/library-view"

export const metadata: Metadata = { title: "素材库 · 数字人工坊" }

export default function StudioLibraryPage() {
  return <StudioLibraryView />
}
