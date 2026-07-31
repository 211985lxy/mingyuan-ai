"use client"

import { useRouter } from "next/navigation"
import {
  Settings,
  LogIn,
  ChevronsUpDown,
  Sun,
  Moon,
  Monitor,
  Check,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/lib/store"
import { useTheme } from "@/components/providers/theme-provider"

/** 底部账户：一行摘要，设置与切换收进菜单 */
export function SidebarAccountMenu({
  active,
  onNavigate,
}: {
  active: boolean
  onNavigate: () => void
}) {
  const router = useRouter()
  const { colorMode, setColorMode } = useTheme()
  const user = useAuthStore((s) => s.user)
  const email = user?.email?.trim() || "账户"
  const initial = email.slice(0, 1).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm outline-none transition-colors",
          active
            ? "bg-primary/10 font-medium text-primary"
            : "text-foreground/75 hover:bg-secondary/60 hover:text-foreground",
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate">{email}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-45" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-52">
        <DropdownMenuItem
          onClick={() => {
            setColorMode("light")
          }}
        >
          <Sun className="h-4 w-4" />
          <span className="flex-1">白天模式</span>
          {colorMode === "light" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setColorMode("dark")
          }}
        >
          <Moon className="h-4 w-4" />
          <span className="flex-1">夜晚模式</span>
          {colorMode === "dark" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setColorMode("system")
          }}
        >
          <Monitor className="h-4 w-4" />
          <span className="flex-1">跟随系统</span>
          {colorMode === "system" ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate()
            router.push("/account")
          }}
        >
          <Settings className="h-4 w-4" />
          账户设置
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            onNavigate()
            router.push("/login?switch=1")
          }}
        >
          <LogIn className="h-4 w-4" />
          切换账号
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
