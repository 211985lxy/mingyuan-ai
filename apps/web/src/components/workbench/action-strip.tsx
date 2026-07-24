import type { ReactNode } from "react"

interface ActionStripProps {
  children: ReactNode
}

/**
 * @description actionstrip
 * @param options - 配置选项
 * @returns 无返回值
 */
export function ActionStrip({ children }: ActionStripProps) {
  return (
    <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
      {children}
    </div>
  )
}
