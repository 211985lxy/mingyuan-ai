import { ArrowRight } from "lucide-react"
import { MARKETING_PRIMARY_CTA } from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

export function CTASection() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h2 className="text-xl font-bold text-[#25211D]">和我们一起找到下一步</h2>
      <p className="mt-3 text-sm text-[#8A8175]">说说经验卡在哪，一起找最小动作。</p>
      <WechatCtaButton className="mt-6 inline-flex items-center rounded-lg bg-[#D14A33] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#B83F2B]">
        {MARKETING_PRIMARY_CTA} <ArrowRight className="ml-2 h-4 w-4" />
      </WechatCtaButton>
    </section>
  )
}
