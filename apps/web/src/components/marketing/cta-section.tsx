import { ArrowRight } from "lucide-react"
import { MARKETING_PRIMARY_CTA } from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

export function CTASection() {
  return (
    <section className="px-0 py-16 sm:py-20">
      <div className="marketing-wrap flex flex-col justify-between gap-8 rounded-2xl bg-[#F3EADF] p-8 sm:p-10 lg:flex-row lg:items-center">
        <div>
          <p className="marketing-section-label">START WITH ONE SCENE</p>
          <h2 className="marketing-h-section mt-3 text-[#25211D]">从一位核心专家、一套关键方法和一条真实业务流程开始</h2>
          <p className="mt-4 text-sm leading-7 text-[#6F675E]">先聊清楚业务目标和当前卡点，再判断下一步是否值得投入。</p>
        </div>
        <WechatCtaButton className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-6 text-sm font-bold text-white transition-colors hover:bg-[#B83F2B]">
          {MARKETING_PRIMARY_CTA} <ArrowRight className="ml-2 h-4 w-4" />
        </WechatCtaButton>
      </div>
    </section>
  )
}
