import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { MARKETING_COMPANY_NAME, MARKETING_PRODUCT_NAME } from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

export function HeroSection() {
  return (
    <section className="border-b border-[#E8DED1] px-0 py-16 sm:py-20 lg:py-28">
      <div className="marketing-wrap grid gap-12 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="marketing-section-label">AI 原生企业 · IP 智能体</p>
          <h1 className="marketing-hero-title marketing-home-title mt-5 max-w-4xl text-[#25211D]">
            <span className="block lg:whitespace-nowrap">让 AI 学会老板的经验</span>
            <em className="block lg:whitespace-nowrap">帮助企业持续获得客户</em>
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-8 text-[#5F5A52] sm:text-lg">
            {MARKETING_COMPANY_NAME} 不是给旧业务加一个 AI 工具，而是让 AI 从一开始就参与经验沉淀、内容生产、审核与复盘。人负责关键判断，AI 放大已经验证过的能力。
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <WechatCtaButton className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-6 text-sm font-semibold text-white hover:bg-[#B83F2B]">
              预约企业诊断 <ArrowRight className="ml-2 h-4 w-4" />
            </WechatCtaButton>
            <Link href="/ip-agent" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#D8CABA] bg-white/70 px-6 text-sm font-semibold text-[#25211D] hover:bg-white">
              了解 {MARKETING_PRODUCT_NAME}
            </Link>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#E3D8C9] bg-[#211D19] p-6 text-[#FFF9EF] sm:p-8">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#D8AA51]">从一个真实场景开始</p>
          <div className="mt-7 space-y-5">
            {[
              ["01", "整理经验", "定位、案例、观点与表达边界"],
              ["02", "进入工作", "选题、文案、审核与矩阵协同"],
              ["03", "结果回流", "用线索与转化继续优化"],
            ].map(([index, title, desc]) => (
              <div key={index} className="grid grid-cols-[34px_1fr] gap-4 border-t border-white/10 pt-5 first:border-t-0 first:pt-0">
                <span className="font-mono text-xs text-[#E75B43]">{index}</span>
                <div>
                  <p className="font-semibold">{title}</p>
                  <p className="mt-1 text-sm leading-6 text-white/50">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
