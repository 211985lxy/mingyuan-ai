import Link from "next/link"
import { MARKETING_COMPANY_NAME, MARKETING_LEGAL_ENTITY } from "@/lib/marketing-brand"

export function MarketingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-[#E8DED1] bg-[#211D19] py-10 text-white">
      <div className="marketing-wrap flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
        <div>
          <p className="marketing-serif text-2xl font-bold">{MARKETING_COMPANY_NAME}</p>
          <p className="mt-2 max-w-xl text-sm leading-7 text-white/55">让 AI 学会企业最有价值的经验，进入真实工作，并帮助企业持续获得客户。</p>
          <p className="mt-5 text-xs text-white/35">© {year} {MARKETING_COMPANY_NAME} · {MARKETING_LEGAL_ENTITY}</p>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-white/60">
          <Link href="/ip-agent" className="hover:text-[#E75B43]">IP 智能体</Link>
          <Link href="/cases" className="hover:text-[#E75B43]">客户案例</Link>
          <Link href="/about" className="hover:text-[#E75B43]">关于我们</Link>
          <Link href="/login" className="hover:text-[#E75B43]">登录明远 AIM</Link>
        </nav>
      </div>
    </footer>
  )
}
