import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"

import { Button } from "@/components/ui/button"

interface WorkbenchHeroProps {
  title: string
  subtitle?: string
  badge?: ReactNode
  actions?: ReactNode
  backHref?: string
  backLabel?: string
}

export function WorkbenchHero({ title, subtitle, badge, actions, backHref, backLabel }: WorkbenchHeroProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-primary/15 bg-card shadow-sm">
      <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {backHref ? (
              <Link href={backHref} aria-label={backLabel ?? "返回上一级"}>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </Link>
            ) : null}
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {badge}
          </div>
          {subtitle ? (
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex w-full min-w-0 flex-wrap items-center gap-2 xl:w-auto xl:justify-end">{actions}</div> : null}
      </div>
    </section>
  )
}
