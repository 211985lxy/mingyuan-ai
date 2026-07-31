"use client"

import { useEffect, useState, type ReactNode } from "react"
import Link from "next/link"
import { Menu } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { MARKETING_COMPANY_NAME } from "@/lib/marketing-brand"

const navLinks = [
  { label: "产品", href: "/ip-agent" },
  { label: "案例", href: "/cases" },
  { label: "关于", href: "/about" },
]

export function MarketingNavbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  })

  return (
    <header className={`sticky top-0 z-50 border-b bg-[#FFFCF6]/90 backdrop-blur-xl transition-shadow ${scrolled ? "shadow-sm" : ""}`}>
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-[#25211D]">
          {MARKETING_COMPANY_NAME}
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {navLinks.map(({ label, href }) => (
            <NavLink key={href} href={href}>{label}</NavLink>
          ))}
          <Link href="/login" className="rounded-lg bg-[#D14A33] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[#B83F2B]">
            登录智能体
          </Link>
        </nav>
        <MobileNav />
      </div>
    </header>
  )
}

function MobileNav() {
  return (
    <div className="md:hidden">
      <Sheet>
        <SheetTrigger className="p-2 text-[#25211D]"><Menu className="h-5 w-5" /></SheetTrigger>
        <SheetContent side="right" className="w-64 bg-white">
          <SheetHeader><SheetTitle className="text-left text-[#25211D]">{MARKETING_COMPANY_NAME}</SheetTitle></SheetHeader>
          <div className="mt-4 flex flex-col gap-3 px-4">
            {navLinks.map(({ label, href }) => (
              <Link key={href} href={href} className="py-2 text-sm text-[#6F675E]">{label}</Link>
            ))}
            <Link href="/login" className="mt-2 rounded-lg bg-[#D14A33] px-4 py-2.5 text-center text-sm font-bold text-white">登录智能体</Link>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-sm text-[#5F5A52] transition-colors hover:text-[#D14A33]">{children}</Link>
}
