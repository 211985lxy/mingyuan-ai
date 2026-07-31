import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MARKETING_COMPANY_NAME, MARKETING_PRODUCT_NAME } from "@/lib/marketing-brand"

export function HeroSection() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-24 sm:py-32">
      <h1 className="text-3xl font-bold tracking-tight text-[#25211D] sm:text-4xl">让 AI 学会老板的经验</h1>
      <p className="mt-4 text-base leading-7 text-[#5F5A52]">
        {MARKETING_COMPANY_NAME} 把经验变成可调用的智能体资产。核心产品 {MARKETING_PRODUCT_NAME}，帮企业持续获得客户。
      </p>
      <Link href="/login" className="mt-8 inline-flex items-center rounded-lg bg-[#D14A33] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#B83F2B]">
        登录智能体 <ArrowRight className="ml-2 h-4 w-4" />
      </Link>
    </section>
  )
}
