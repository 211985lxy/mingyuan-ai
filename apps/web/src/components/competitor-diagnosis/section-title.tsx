import type { ReactNode } from "react"

/**
 * @description sectiontitle
 * @param options - 配置选项
 * @returns 无返回值
 */
export function SectionTitle({
  title,
  subtitle,
  icon,
  anchor,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  anchor?: string
}) {
  return (
    <div id={anchor} className="scroll-mt-20">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  )
}
