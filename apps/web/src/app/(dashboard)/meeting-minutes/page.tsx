"use client"

import { Suspense } from "react"
import { MeetingMinutesWorkspace } from "@/features/meeting-minutes/components/meeting-minutes-workspace"

function MeetingMinutesFallback() {
  return (
    <div className="mx-auto flex w-full max-w-5xl px-4 py-8 text-sm text-muted-foreground sm:px-6">
      正在打开会议纪要…
    </div>
  )
}

export default function MeetingMinutesPage() {
  return (
    <Suspense fallback={<MeetingMinutesFallback />}>
      <MeetingMinutesWorkspace />
    </Suspense>
  )
}
