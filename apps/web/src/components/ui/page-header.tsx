import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

interface PageHeaderProps {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  children?: React.ReactNode
}

function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel,
  children,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        {backHref ? (
          <div className="flex items-center gap-2 mb-1">
            <Link href={backHref} aria-label={backLabel ?? "返回"}>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          </div>
        ) : (
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        )}
        {subtitle && (
          <p
            className={`text-muted-foreground mt-1${backHref ? " ml-10" : ""}`}
          >
            {subtitle}
          </p>
        )}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}

export { PageHeader }
export type { PageHeaderProps }
