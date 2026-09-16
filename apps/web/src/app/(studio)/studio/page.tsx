import type { Metadata } from "next"
import { StudioHome } from "@/features/studio/studio-home"

export const metadata: Metadata = { title: "数字人工坊" }

export default function StudioHomePage() {
  return <StudioHome />
}
