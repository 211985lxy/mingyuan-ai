import type { ReactNode } from "react"

interface AdminPageHeaderProps {
  title: string
  description: string
  actions?: ReactNode
  meta?: ReactNode
}

/**
 * @description adminpageheader
 * @param options - 配置选项
 * @returns 无返回值
 */
export function AdminPageHeader({ title, description, actions, meta }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {meta}
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
