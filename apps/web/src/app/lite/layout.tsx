"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { MessageCircle, LayoutGrid, Sparkles } from "lucide-react"

import { AuthGuard } from "@/components/layout/auth-guard"
import { Button } from "@/components/ui/button"
import { useSessionVerify } from "@/hooks/use-session-verify"
import { useAuthStore } from "@/lib/store"
import { cn } from "@/lib/utils"

/**
 * 极简版骨架：无侧边栏，只有一条顶栏。
 * 与 (dashboard) 共用 AuthGuard / useSessionVerify，登录态完全一致。
 */
export default function LiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  useSessionVerify()
  const pathname = usePathname()
  const router = useRouter()
  const user = useAuthStore((s) => s.user)
  const email = user?.email?.trim() || "账户"
  const initial = email.slice(0, 1).toUpperCase()

  // 极简版页面：大脑选择器 + 对话（默认）与我的作品
  const isChat = pathname === "/lite" || pathname.startsWith("/lite/chat")
  const isWorks = pathname.startsWith("/lite/works")

  return (
    <AuthGuard>
      <div className="flex min-h-screen flex-col bg-background">
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur md:px-4">
          <Link href="/lite" className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-sm font-semibold tracking-tight">明动 AIM</span>
          </Link>

          {/* 两个页签就是极简版的全部导航 */}
          <nav className="ml-2 flex items-center gap-1" aria-label="极简版导航">
            <Link
              href="/lite"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                isChat
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <MessageCircle className="size-3.5" />
              AIM 大脑
            </Link>
            <Link
              href="/lite/works"
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-3 text-sm transition-colors",
                isWorks
                  ? "bg-secondary font-medium text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-3.5" />
              我的作品
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 cursor-pointer px-3 text-xs text-muted-foreground"
              onClick={() => router.push("/home")}
            >
              完整版
            </Button>
            <button
              type="button"
              aria-label="切换账号"
              title={email}
              onClick={() => router.push("/login?switch=1")}
              className="flex size-8 cursor-pointer items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              {initial}
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </AuthGuard>
  )
}
