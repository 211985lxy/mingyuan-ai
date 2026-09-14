"use client"

import { Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/**
 * 高级设置右侧抽屉：语速/档位等进阶参数统一收进这里，不阻断主流程。
 * 「高级全部折叠」——主界面永远只有一个显眼的下一步。
 */
export function AdvancedDrawer({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" />
        }
      >
        <Settings2 className="h-3.5 w-3.5" />
        高级设置
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-5 overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  )
}
