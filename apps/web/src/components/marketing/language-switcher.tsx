"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

/**
 * @description languageswitcher
 * @param options - 配置选项
 * @returns 无返回值
 */
export function LanguageSwitcher({ currentLocale }: { currentLocale: string }) {
  const router = useRouter()
  const locale = currentLocale.toLowerCase().replace("_", "-").startsWith("en")
    ? "en"
    : "zh"

  const toggle = () => {
    const next = locale === "zh" ? "en" : "zh"
    document.cookie = `locale=${next}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      className="cursor-pointer text-sm font-medium text-indigo-200/70 hover:text-white hover:bg-white/10 transition-colors duration-200"
    >
      {locale === "zh" ? "EN" : "中文"}
    </Button>
  )
}
