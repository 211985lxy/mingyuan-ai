"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Clapperboard, FolderOpen, Library } from "lucide-react"
import { BrandLogo } from "@/components/branding/brand-logo"
import { cn } from "@/lib/utils"

const STUDIO_LINKS = [
  { title: "素材库", href: "/studio/library", icon: FolderOpen },
  { title: "作品", href: "/studio/works", icon: Library },
] as const

/**
 * 数字人工坊独立顶栏：沉浸式工作区的唯一常驻导航。
 * 不复用 dashboard 侧栏——工坊内只保留「返回 + 素材库/作品」。
 */
export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? ""
  const isHome = pathname === "/studio"

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-3 px-3 md:px-4">
          {isHome ? (
            <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
              <BrandLogo className="h-6 w-6 rounded-md" />
              数字人工坊
            </span>
          ) : (
            <Link
              href="/studio"
              className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              工坊
            </Link>
          )}
          <nav className="ml-auto flex items-center gap-1">
            {STUDIO_LINKS.map((link) => {
              const active = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-foreground/[0.07] font-medium text-foreground"
                      : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                >
                  <link.icon className="h-4 w-4 opacity-70" />
                  {link.title}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24 pt-8 md:px-8">{children}</main>
      <footer className="border-t border-border/40 py-3 text-center text-xs text-muted-foreground">
        <Clapperboard className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        数字人工坊 · 音频与视频数字人一站式出品
      </footer>
    </div>
  )
}
