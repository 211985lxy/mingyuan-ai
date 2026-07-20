"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useLocale, useTranslations } from "next-intl"
import { Menu } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useBranding } from "@/components/providers/branding-provider"
import { BrandLogo } from "@/components/branding/brand-logo"
import { LanguageSwitcher } from "./language-switcher"

const navLinks = [
  { key: "features", href: "#features" },
  { key: "howItWorks", href: "#how-it-works" },
  { key: "useCases", href: "#use-cases" },
]

/**
 * @description marketingnavbar
 * @returns 无返回值
 */
export function MarketingNavbar() {
  const locale = useLocale()
  const t = useTranslations("Navbar")
  const branding = useBranding()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={`marketing-nav sticky top-0 z-50 w-full border-b transition-colors duration-300 ${
        scrolled
          ? "border-[#E8DED1] bg-white/90 backdrop-blur-xl"
          : "border-transparent bg-[#FAF8F3]/0"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo className="h-8 w-8" />
          <span className="text-xl font-bold text-[#25211D]">{branding.name}</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {navLinks.map(({ key, href }) => (
            <a
              key={key}
              href={href}
              className="text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:text-[#D14A33]"
            >
              {t(key)}
            </a>
          ))}
        </nav>

        {/* Desktop actions */}
        <div className="hidden items-center gap-3 md:flex">
          <LanguageSwitcher currentLocale={locale} />
          <Link
            href="/login"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:bg-[#FAF8F3] hover:text-[#25211D]"
          >
            {t("login")}
          </Link>
          <Link
            href="/register"
            className="jade-emboss inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-[#D14A33]/20 transition-colors duration-200 hover:bg-[#B83F2B]"
          >
            {t("cta")}
          </Link>
        </div>

        {/* Mobile nav */}
        <div className="flex md:hidden">
          <Sheet>
            <SheetTrigger className="inline-flex cursor-pointer items-center justify-center rounded-md p-2 text-[#25211D] transition-colors duration-200 hover:bg-[#FAF8F3]">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-[#E8DED1] bg-white">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-[#25211D]">
                  <BrandLogo className="h-6 w-6" />
                  {branding.name}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-2 px-4">
                {navLinks.map(({ key, href }) => (
                  <a
                    key={key}
                    href={href}
                    className="py-2.5 text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:text-[#D14A33]"
                  >
                    {t(key)}
                  </a>
                ))}
                <div className="my-3 border-t border-[#E8DED1]" />
                <LanguageSwitcher currentLocale={locale} />
                <Link
                  href="/login"
                  className="py-2.5 text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:text-[#D14A33]"
                >
                  {t("login")}
                </Link>
                <Link
                  href="/register"
                  className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#B83F2B]"
                >
                  {t("cta")}
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
