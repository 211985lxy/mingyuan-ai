import Link from "next/link"
import { MARKETING_COMPANY_NAME, MARKETING_LEGAL_ENTITY } from "@/lib/marketing-brand"

export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-[#E8DED1] bg-[#FFFCF6] py-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <p className="text-sm text-[#8A8175]">© {year} {MARKETING_COMPANY_NAME} · {MARKETING_LEGAL_ENTITY}</p>
        <nav className="flex gap-4 text-sm text-[#8A8175]">
          <Link href="/ip-agent" className="hover:text-[#D14A33]">产品</Link>
          <Link href="/login" className="hover:text-[#D14A33]">登录</Link>
          <Link href="/about" className="hover:text-[#D14A33]">关于</Link>
        </nav>
      </div>
    </footer>
  )
}
