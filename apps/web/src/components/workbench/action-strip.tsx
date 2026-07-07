import type { ReactNode } from "react"

interface ActionStripProps {
  children: ReactNode
}

export function ActionStrip({ children }: ActionStripProps) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-3">
      {children}
    </div>
  )
}
