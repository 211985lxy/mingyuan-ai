import Link from "next/link"
import { ArrowRight } from "lucide-react"

/**
 * 竞品研究相关工具的精简一行导航。
 * @description competitorworkbenchlinks
 * @returns 无返回值
 */
export function CompetitorWorkbenchLinks() {
  const links = [
    { href: "/video-copy", label: "爆款文案拆解" },
    { href: "/ai-hot", label: "全网热点洞察" },
  ]
  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>相关工具：</span>
      <span className="font-medium text-foreground">优质账号分析</span>
      {links.map((item) => (
        <Link key={item.href} href={item.href} className="inline-flex items-center gap-0.5 transition-colors hover:text-primary">
          {item.label}
          <ArrowRight className="h-3 w-3" />
        </Link>
      ))}
    </nav>
  )
}
