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

type ThemeContextValue = {
  /** 用户偏好：light / dark / system */
  colorMode: ColorMode
  /** 实际生效的浅/深色（system 会被解析为具体值） */
  resolvedMode: "light" | "dark"
  setColorMode: (mode: ColorMode) => void
  toggleColorMode: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function prefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function resolveMode(mode: ColorMode): "light" | "dark" {
  return mode === "system" ? (prefersDark() ? "dark" : "light") : mode
}

function applyColorMode(mode: ColorMode) {
  const resolved = resolveMode(mode)
  const root = document.documentElement
  root.classList.toggle("dark", resolved === "dark")
  root.style.colorScheme = resolved
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

/**
 * 品牌日/夜/跟随系统模式：浅色暖玉玄黄，深色玄曜赤金。
 * 首屏主题初始化的唯一来源见 `ThemeBootScript`，避免重复内联脚本。
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>("system")
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">("light")

  useEffect(() => {
    const mode = readStoredColorMode()
    setColorModeState(mode)
    applyColorMode(mode)
    setResolvedMode(resolveMode(mode))
  }, [])

  // system 模式下实时跟随操作系统主题切换
  useEffect(() => {
    if (colorMode !== "system" || typeof window === "undefined" || !window.matchMedia) return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      applyColorMode("system")
      setResolvedMode(resolveMode("system"))
    }
    media.addEventListener("change", handleChange)
    return () => media.removeEventListener("change", handleChange)
  }, [colorMode])

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode)
    applyColorMode(mode)
    setResolvedMode(resolveMode(mode))
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // ignore
    }
  }, [])

  const toggleColorMode = useCallback(() => {
    setColorMode(resolvedMode === "dark" ? "light" : "dark")
  }, [resolvedMode, setColorMode])

  const value = useMemo(
    () => ({ colorMode, resolvedMode, setColorMode, toggleColorMode }),
    [colorMode, resolvedMode, setColorMode, toggleColorMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// 与 readStoredColorMode / resolveMode 保持同一套判定逻辑的纯字符串版本，
// 供解析前（无 React/无 window matchMedia 监听）的首屏脚本使用。
const THEME_BOOT_SCRIPT = `(function(){try{var k=${JSON.stringify(STORAGE_KEY)};var m=localStorage.getItem(k);if(m!=="light"&&m!=="dark"&&m!=="system"){m="system"}var dark=m==="dark"||(m==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(dark){r.classList.add("dark");r.style.colorScheme="dark"}else{r.classList.remove("dark");r.style.colorScheme="light"}}catch(e){}})();`

/**
 * 在 HTML 解析阶段同步应用主题（含 system），避免暖玉/玄曜首屏闪烁。
 * 这是唯一的主题初始化脚本来源——不要在别处再内联同类逻辑。
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
