import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

/**
 * 统一空态：全站「还没有内容」的容器。
 *
 * 大厂空态的三要素——图标给情绪、一句人话说明为什么空、一个明确的下一步。
 * 存量页面此前各写各的（41 个文件），新代码请统一走这里，存量逐步收敛。
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  bordered = true,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  /** 下一步动作：按钮或链接，避免用户停在死路 */
  action?: React.ReactNode
  className?: string
  bordered?: boolean
}) {
  return (
    <Card className={cn(bordered && "border-dashed shadow-none", className)}>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        {icon ? (
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </span>
        ) : null}
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description ? (
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ? <div className="flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
      </CardContent>
    </Card>
  )
}
