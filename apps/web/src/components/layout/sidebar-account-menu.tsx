"use client"

import { useRouter } from "next/navigation"
import {
  Settings,
  LogIn,
  ChevronsUpDown,
  Sun,
  Moon,
  Monitor,
  Palette,
  Check,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useAuthStore } from "@/lib/store"
import {
  useTheme,
  LIGHT_BRAND_THEMES,
  DARK_BRAND_THEMES,
  type LightBrandTheme,
  type DarkBrandTheme,
} from "@/components/providers/theme-provider"

/** 各境展示元数据：底色 + 主色取自 brand-themes.css 同源 oklch 值 */
const LIGHT_THEME_META: Record<LightBrandTheme, { label: string; bg: string; primary: string }> = {
  "": { label: "默认 · 暖玉玄黄", bg: "oklch(0.982 0.012 76)", primary: "oklch(0.575 0.205 28)" },
  qinghua: { label: "月白青花", bg: "oklch(0.978 0.008 235)", primary: "oklch(0.52 0.12 240)" },
  suxuan: { label: "素宣点朱", bg: "oklch(0.975 0.004 90)", primary: "oklch(0.575 0.205 28)" },
  zhuqing: { label: "松花竹青", bg: "oklch(0.972 0.018 150)", primary: "oklch(0.50 0.10 165)" },
}
const DARK_THEME_META: Record<DarkBrandTheme, { label: string; bg: string; primary: string }> = {
  "": { label: "默认 · 玄曜赤金", bg: "oklch(0.145 0.02 65)", primary: "oklch(0.745 0.185 38)" },
  xuanshui: { label: "玄水涵朱", bg: "oklch(0.155 0.022 255)", primary: "oklch(0.575 0.20 29)" },
  songmo: { label: "松烟入墨", bg: "oklch(0.165 0.008 90)", primary: "oklch(0.575 0.205 28)" },
  cangdai: { label: "苍黛描金", bg: "oklch(0.17 0.028 195)", primary: "oklch(0.74 0.14 75)" },
}

const COLOR_MODE_ITEMS = [
  { mode: "light" as const, icon: Sun, label: "白天模式" },
  { mode: "dark" as const, icon: Moon, label: "夜晚模式" },
  { mode: "system" as const, icon: Monitor, label: "跟随系统" },
]

/** 主题境子菜单：跟随当前明暗列出对应四境，明暗各记忆一境 */
function BrandThemeSubmenu() {
  const { resolvedMode, brandTheme, setBrandTheme } = useTheme()
  const isDark = resolvedMode === "dark"
  const options = (
    isDark ? (DARK_BRAND_THEMES as readonly string[]) : (LIGHT_BRAND_THEMES as readonly string[])
  ) as (LightBrandTheme | DarkBrandTheme)[]
  // options 与 meta 同源于 isDark，键必然匹配；两类主题的键空间不同，
  // 需收敛为统一键类型才能索引（TS 不允许用联合键索引联合 Record）
  const meta = (isDark ? DARK_THEME_META : LIGHT_THEME_META) as Record<
    LightBrandTheme | DarkBrandTheme,
    { label: string; bg: string; primary: string }
  >
  const currentBrand = isDark ? brandTheme.dark : brandTheme.light

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Palette className="h-4 w-4" />
        <span>主题境</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-52">
        {options.map((theme) => (
          <DropdownMenuItem
            key={theme || "default"}
            onClick={() => {
              setBrandTheme(theme)
            }}
          >
            <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
              <span
                className="h-3.5 w-3.5 rounded-full ring-1 ring-foreground/10"
                style={{ background: meta[theme].bg }}
              />
              <span
                className="h-3.5 w-3.5 rounded-full ring-1 ring-foreground/10"
                style={{ background: meta[theme].primary }}
              />
            </span>
            <span className="flex-1">{meta[theme].label}</span>
            {currentBrand === theme ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

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
        {COLOR_MODE_ITEMS.map(({ mode, icon: Icon, label }) => (
          <DropdownMenuItem
            key={mode}
            onClick={() => {
              setColorMode(mode)
            }}
          >
            <Icon className="h-4 w-4" />
            <span className="flex-1">{label}</span>
            {colorMode === mode ? <Check className="h-3.5 w-3.5 text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <BrandThemeSubmenu />
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
