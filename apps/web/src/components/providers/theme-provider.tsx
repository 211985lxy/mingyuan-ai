"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import Script from "next/script"

export type ColorMode = "light" | "dark" | "system"

const STORAGE_KEY = "mingyuan-color-mode"
const BRAND_LIGHT_KEY = "mingyuan-brand-theme-light"
const BRAND_DARK_KEY = "mingyuan-brand-theme-dark"

/** 亮色境（"" = 默认·暖玉玄黄），与 brand-themes.css 的选择器白名单一致 */
export const LIGHT_BRAND_THEMES = ["", "qinghua", "suxuan", "zhuqing"] as const
/** 暗色境（"" = 默认·玄曜赤金） */
export const DARK_BRAND_THEMES = ["", "xuanshui", "songmo", "cangdai"] as const
export type LightBrandTheme = (typeof LIGHT_BRAND_THEMES)[number]
export type DarkBrandTheme = (typeof DARK_BRAND_THEMES)[number]

type BrandThemePref = { light: LightBrandTheme; dark: DarkBrandTheme }

type ThemeContextValue = {
  /** 用户偏好：light / dark / system */
  colorMode: ColorMode
  /** 实际生效的浅/深色（system 会被解析为具体值） */
  resolvedMode: "light" | "dark"
  setColorMode: (mode: ColorMode) => void
  toggleColorMode: () => void
  /** 当前明暗各记忆的境（light/dark 各自独立） */
  brandTheme: BrandThemePref
  /** 切换当前生效明暗下的境，持久化并立即应用 */
  setBrandTheme: (theme: LightBrandTheme | DarkBrandTheme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function resolveMode(mode: ColorMode): "light" | "dark" {
  return mode === "system" ? (prefersDark() ? "dark" : "light") : mode
}

function isLightBrandTheme(v: string): v is LightBrandTheme {
  return (LIGHT_BRAND_THEMES as readonly string[]).includes(v)
}

function isDarkBrandTheme(v: string): v is DarkBrandTheme {
  return (DARK_BRAND_THEMES as readonly string[]).includes(v)
}

function applyColorMode(resolved: "light" | "dark") {
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
}

function applyBrandTheme(mode: "light" | "dark", theme: string) {
  const valid = mode === "dark" ? isDarkBrandTheme(theme) : isLightBrandTheme(theme)
  const root = document.documentElement
  if (theme && valid) root.setAttribute("data-brand-theme", theme)
  else root.removeAttribute("data-brand-theme")
}

function readStoredColorMode(): ColorMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    // 兼容旧版本仅存 light/dark 的用户；新用户默认跟随系统
    if (stored === "dark" || stored === "light" || stored === "system") return stored
  } catch {
    // ignore
  }
  return "system"
}

function readStoredBrandTheme(mode: "light" | "dark"): string {
  try {
    return localStorage.getItem(mode === "dark" ? BRAND_DARK_KEY : BRAND_LIGHT_KEY) ?? ""
  } catch {
    // ignore
  }
  return ""
}

/**
 * 品牌日/夜/跟随系统模式：浅色默认暖玉玄黄，深色默认玄曜赤金；
 * 明暗之下还可用 data-brand-theme 各自记忆一境（八境主题层，见
 * docs/design-system/clipflow/IMPLEMENTATION.md 第七章）。
 * 首屏主题初始化的唯一来源见 `ThemeBootScript`，避免重复内联脚本。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>("system")
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">("light")
  const [brandTheme, setBrandThemePref] = useState<BrandThemePref>({ light: "", dark: "" })

  const applyAll = useCallback((mode: ColorMode, brand: BrandThemePref) => {
    const resolved = resolveMode(mode)
    applyColorMode(resolved)
    applyBrandTheme(resolved, resolved === "dark" ? brand.dark : brand.light)
    return resolved
  }, [])

  useEffect(() => {
    const mode = readStoredColorMode()
    const brand: BrandThemePref = {
      light: isLightBrandTheme(readStoredBrandTheme("light")) ? (readStoredBrandTheme("light") as LightBrandTheme) : "",
      dark: isDarkBrandTheme(readStoredBrandTheme("dark")) ? (readStoredBrandTheme("dark") as DarkBrandTheme) : "",
    }
    setColorModeState(mode)
    setBrandThemePref(brand)
    setResolvedMode(applyAll(mode, brand))
  }, [applyAll])

  // system 模式下实时跟随操作系统主题切换
  useEffect(() => {
    if (colorMode !== "system" || typeof window === "undefined" || !window.matchMedia) return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      setResolvedMode(applyAll("system", brandTheme))
    }
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [colorMode, brandTheme, applyAll])

  const setColorMode = useCallback(
    (mode: ColorMode) => {
      setColorModeState(mode)
      setResolvedMode(applyAll(mode, brandTheme))
      try {
        localStorage.setItem(STORAGE_KEY, mode)
      } catch {
        // ignore
      }
    },
    [brandTheme, applyAll],
  )

  const toggleColorMode = useCallback(() => {
    setColorMode(resolvedMode === "dark" ? "light" : "dark")
  }, [resolvedMode, setColorMode])

  const setBrandTheme = useCallback(
    (theme: LightBrandTheme | DarkBrandTheme) => {
      const resolved = resolveMode(colorMode)
      const next: BrandThemePref =
        resolved === "dark"
          ? { ...brandTheme, dark: isDarkBrandTheme(theme) ? theme : "" }
          : { ...brandTheme, light: isLightBrandTheme(theme) ? theme : "" }
      setBrandThemePref(next)
      applyBrandTheme(resolved, resolved === "dark" ? next.dark : next.light)
      try {
        localStorage.setItem(resolved === "dark" ? BRAND_DARK_KEY : BRAND_LIGHT_KEY, theme)
      } catch {
        // ignore
      }
    },
    [colorMode, brandTheme],
  )

  const value = useMemo(
    () => ({ colorMode, resolvedMode, setColorMode, toggleColorMode, brandTheme, setBrandTheme }),
    [colorMode, resolvedMode, setColorMode, toggleColorMode, brandTheme, setBrandTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// 与上方 readStored*/resolve 逻辑保持同一套判定的纯字符串版本，
// 供解析前（无 React/无 window matchMedia 监听）的首屏脚本使用。
// 导出仅供组件测试断言；页面代码不要直接执行该字符串。
export const THEME_BOOT_SCRIPT = `(function(){
try{
var L=${JSON.stringify(LIGHT_BRAND_THEMES)};var D=${JSON.stringify(DARK_BRAND_THEMES)};
var k=${JSON.stringify(STORAGE_KEY)};var kl=${JSON.stringify(BRAND_LIGHT_KEY)};var kd=${JSON.stringify(BRAND_DARK_KEY)};
var m=localStorage.getItem(k);if(m!=="light"&&m!=="dark"&&m!=="system"){m="system"}
var dark=m==="dark"||(m==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);
var r=document.documentElement;
if(dark){r.classList.add("dark");r.style.colorScheme="dark"}else{r.classList.remove("dark");r.style.colorScheme="light"}
var v=dark?localStorage.getItem(kd):localStorage.getItem(kl);
var ok=v!=null&&(dark?D.indexOf(v)>-1:L.indexOf(v)>-1);
if(v&&ok){r.setAttribute("data-brand-theme",v)}else{r.removeAttribute("data-brand-theme")}
}catch(e){}})();`

/**
 * 在 HTML 解析阶段同步应用主题（含 system 与八境 data-brand-theme），
 * 避免暖玉/玄曜首屏闪烁。这是唯一的主题初始化脚本来源——不要在别处再内联同类逻辑。
 */
export function ThemeBootScript() {
  return (
    <Script id="mingyuan-theme-boot" strategy="beforeInteractive">
      {THEME_BOOT_SCRIPT}
    </Script>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider")
  }
  return ctx
}
