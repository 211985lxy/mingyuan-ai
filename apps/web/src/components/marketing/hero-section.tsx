"use client"

import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_PRIMARY_CTA,
  MARKETING_PRODUCT_NAME,
} from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

const proofStrip = [
  { value: "4000+", label: "单月精准线索（项目方提供）" },
  { value: "20+", label: "账号矩阵协同" },
  { value: "近千万", label: "内部实践单条播放" },
]

/**
 * @description Editorial hero inspired by evidence-first studio sites.
 */
export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-0 pb-10 pt-14 sm:pb-14 sm:pt-20 lg:pt-24">
      <div className="marketing-wrap">
        <div className="hero-head max-w-4xl">
          <p className="marketing-section-label mb-4">最近在做</p>
          <h1 className="marketing-hero-title text-[#25211D]">
            <em>{MARKETING_COMPANY_NAME}</em> 在做什么
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#5F5A52] sm:text-lg">
            判断不靠口号。看我们如何让 AI 学会老板的经验，进入真实工作，并帮助企业持续获得客户——比任何介绍都准。
          </p>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#8A8175]">
            核心产品 {MARKETING_PRODUCT_NAME}
            ：把经验变成可调用、可迭代的智能体资产。
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center">
          <WechatCtaButton className="jade-emboss inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#D14A33]/25 transition-colors duration-200 hover:bg-[#B83F2B] sm:w-auto">
            {MARKETING_PRIMARY_CTA}
            <ArrowRight className="ml-2 h-4 w-4" />
          </WechatCtaButton>
          <Link
            href="/#product"
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-[#E8DED1] bg-white/80 px-7 py-3.5 text-sm font-semibold text-[#25211D] backdrop-blur transition-colors duration-200 hover:border-[#D14A33]/30 hover:bg-[#FFF8F4] sm:w-auto"
          >
            看 {MARKETING_PRODUCT_NAME} 怎么跑 →
          </Link>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {proofStrip.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[#E8DED1] bg-white/75 px-5 py-4 backdrop-blur"
            >
              <p className="marketing-serif text-2xl font-bold tracking-tight text-[#D14A33]">
                {item.value}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#8A8175]">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
