"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { BrandLogo } from "@/components/branding/brand-logo"
import {
  MARKETING_COMPANY_NAME,
} from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

const navLinks = [
  { label: "首页", href: "/" },
  { label: "IP 智能体", href: "/ip-agent" },
  { label: "客户案例", href: "/cases" },
]

/**
 * @description Marketing site navbar for 明动远见 brand pages.
 */
export function MarketingNavbar() {
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
        <Link href="/" className="flex items-center gap-2.5">
          <BrandLogo className="h-8 w-8" />
          <span className="text-xl font-bold text-[#25211D]">
            {MARKETING_COMPANY_NAME}
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="主导航">
          {navLinks.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:text-[#D14A33]"
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="inline-flex cursor-pointer items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:bg-white/70 hover:text-[#25211D]"
          >
            登录
          </Link>
          <WechatCtaButton className="marketing-cta-mini cursor-pointer">
            预约诊断
          </WechatCtaButton>
        </div>

        <div className="flex md:hidden">
          <Sheet>
            <SheetTrigger className="inline-flex cursor-pointer items-center justify-center rounded-md p-2 text-[#25211D] transition-colors duration-200 hover:bg-[#FAF8F3]">
              <Menu className="h-5 w-5" />
              <span className="sr-only">打开菜单</span>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 border-[#E8DED1] bg-white">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-[#25211D]">
                  <BrandLogo className="h-6 w-6" />
                  {MARKETING_COMPANY_NAME}
                </SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-2 px-4">
                {navLinks.map(({ label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    className="py-2.5 text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:text-[#D14A33]"
                  >
                    {label}
                  </Link>
                ))}
                <div className="my-3 border-t border-[#E8DED1]" />
                <Link
                  href="/login"
                  className="py-2.5 text-sm font-medium text-[#6F675E] transition-colors duration-200 hover:text-[#D14A33]"
                >
                  登录 AIM
                </Link>
                <WechatCtaButton className="marketing-cta-mini mt-1 cursor-pointer">
                  预约诊断
                </WechatCtaButton>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
