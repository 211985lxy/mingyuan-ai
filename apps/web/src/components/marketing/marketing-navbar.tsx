"use client"

import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import Link from "next/link"
import { ChevronDown, Menu } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { MARKETING_COMPANY_NAME } from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

const navLinks = [
  { label: "产品", href: "/ip-agent" },
  { label: "案例", href: "/cases" },
  { label: "关于", href: "/about" },
]

const serviceLinks = [
  {
    label: "核心产品",
    title: "IP 智能体",
    description: "把老板经验转成持续内容获客能力",
    href: "/vision/#agent",
  },
  {
    label: "能力共建",
    title: "专业方法智能体",
    description: "让专家方法成为团队可调用资产",
    href: "/vision/#services",
  },
  {
    label: "深度合作",
    title: "企业 AI 业务共建",
    description: "从一个真实高价值场景开始落地",
    href: "/vision/#method",
  },
]

function MarketingBrand() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-[38px] w-[38px] place-items-center rounded-full bg-[#D14A33] text-sm font-bold text-[#FFFAF2]">
        M
      </span>
      <span className="grid gap-0.5">
        <strong className="text-[17px] font-bold tracking-[0.08em] text-[#25211D]">
          {MARKETING_COMPANY_NAME}
        </strong>
        <small className="font-mono text-[8px] tracking-[0.18em] text-[#746C62]">
          MINGDONG VISION
        </small>
      </span>
    </span>
  )
}

/**
 * @description Unified marketing navbar shared by all public brand pages.
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
      className={`marketing-nav sticky top-0 z-50 w-full border-b bg-[#FFFCF6]/90 backdrop-blur-xl transition-shadow duration-300 ${
        scrolled
          ? "border-[#D9CFC1] shadow-[0_10px_30px_rgba(56,39,22,0.06)]"
          : "border-[#D9CFC1]/75"
      }`}
    >
      <div className="mx-auto grid h-[76px] w-[min(calc(100%_-_48px),1180px)] grid-cols-[minmax(190px,1fr)_auto_minmax(250px,1fr)] items-center max-md:flex max-md:w-[calc(100%_-_30px)] max-md:justify-between">
        <Link href="/" aria-label="明动远见首页">
          <MarketingBrand />
        </Link>

        <DesktopNav />
        <HeaderActions />
        <MobileNav />
      </div>
    </header>
  )
}

function DesktopNav() {
  return (
    <nav
      className="hidden h-full items-stretch gap-[30px] text-sm text-[#544D45] md:flex"
      aria-label="主导航"
    >
      <NavLink href="/">首页</NavLink>
      <div className="group relative flex">
        <button
          type="button"
          className="relative inline-flex cursor-pointer items-center gap-1 after:absolute after:inset-x-0 after:bottom-5 after:h-0.5 after:origin-center after:scale-x-0 after:bg-[#D14A33] after:transition-transform group-hover:after:scale-x-100 group-focus-within:after:scale-x-100"
        >
          服务
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <ServiceMenu />
      </div>
      {navLinks.map(({ label, href }) => (
        <NavLink key={href} href={href}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function ServiceMenu() {
  return (
    <div className="invisible absolute top-[77px] left-[-26px] z-50 grid w-[410px] -translate-y-2 border border-[#D9CFC1] bg-[#FFFCF6] p-2.5 opacity-0 shadow-[0_28px_65px_rgba(44,29,15,0.15)] transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
      {serviceLinks.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="grid grid-cols-[78px_1fr] gap-x-3.5 gap-y-0.5 border-b border-[#E6DDD1] p-4 last:border-b-0 hover:bg-[#F4EDE3]"
        >
          <small className="row-span-2 h-fit w-fit border border-[#D14A33]/30 px-2 py-1 text-[8px] font-bold text-[#D14A33]">
            {item.label}
          </small>
          <strong className="text-sm text-[#25211D]">{item.title}</strong>
          <span className="text-[10px] leading-4 text-[#746C62]">
            {item.description}
          </span>
        </Link>
      ))}
    </div>
  )
}

function HeaderActions() {
  return (
    <div className="hidden items-center justify-self-end gap-2.5 md:flex">
      <Link
        href="/login"
        className="inline-flex min-h-11 cursor-pointer items-center justify-center border border-[#D14A33] px-4 text-xs font-semibold text-[#25211D] transition-colors hover:bg-[#FFF4EF]"
      >
        登录 AIM
      </Link>
      <WechatCtaButton className="inline-flex min-h-11 cursor-pointer items-center justify-center bg-[#25211D] px-4 text-xs font-semibold text-[#FFFAF2] transition-colors hover:bg-[#D14A33]">
        预约诊断
      </WechatCtaButton>
    </div>
  )
}

function MobileNav() {
  return (
    <div className="flex md:hidden">
      <Sheet>
        <SheetTrigger className="inline-flex cursor-pointer items-center justify-center rounded-md p-2 text-[#25211D] transition-colors duration-200 hover:bg-[#FAF8F3]">
          <Menu className="h-5 w-5" />
          <span className="sr-only">打开菜单</span>
        </SheetTrigger>
        <SheetContent side="right" className="w-72 border-[#E8DED1] bg-white">
          <SheetHeader>
            <SheetTitle className="text-left text-[#25211D]">
              <MarketingBrand />
            </SheetTitle>
          </SheetHeader>
          <MobileNavLinks />
        </SheetContent>
      </Sheet>
    </div>
  )
}

function MobileNavLinks() {
  return (
    <div className="mt-6 flex flex-col gap-2 px-4">
      <Link href="/" className="py-2.5 text-sm font-medium text-[#6F675E]">
        首页
      </Link>
      <p className="mt-2 text-[10px] font-bold tracking-[0.14em] text-[#B88C33]">
        服务
      </p>
      {serviceLinks.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="border-l border-[#E8DED1] py-2 pl-3 text-sm font-medium text-[#6F675E] transition-colors hover:border-[#D14A33] hover:text-[#D14A33]"
        >
          {item.title}
        </Link>
      ))}
      {navLinks.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          className="py-2.5 text-sm font-medium text-[#6F675E] transition-colors hover:text-[#D14A33]"
        >
          {label}
        </Link>
      ))}
      <div className="my-3 border-t border-[#E8DED1]" />
      <Link
        href="/login"
        className="py-2.5 text-sm font-medium text-[#6F675E] transition-colors hover:text-[#D14A33]"
      >
        登录 AIM
      </Link>
      <WechatCtaButton className="mt-1 inline-flex min-h-11 cursor-pointer items-center justify-center bg-[#25211D] px-4 text-xs font-semibold text-white">
        预约诊断
      </WechatCtaButton>
    </div>
  )
}

function NavLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="relative inline-flex items-center after:absolute after:inset-x-0 after:bottom-5 after:h-0.5 after:origin-center after:scale-x-0 after:bg-[#D14A33] after:transition-transform hover:after:scale-x-100"
    >
      {children}
    </Link>
  )
}
