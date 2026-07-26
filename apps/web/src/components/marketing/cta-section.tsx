"use client"

import Image from "next/image"
import { ArrowRight, Check } from "lucide-react"
import {
  MARKETING_PRIMARY_CTA,
  MARKETING_WECHAT_NOTE,
  MARKETING_WECHAT_QR_PATH,
} from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

const ticks = ["一位核心专家", "一套关键方法", "一条真实业务流程"]

/**
 * @description Bottom CTA bar with inline QR preview — yibi-style density.
 */
export function CTASection() {
  return (
    <section className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="overflow-hidden rounded-2xl border border-[#E8DED1] bg-[#25211D]">
          <div className="grid items-center gap-8 p-8 sm:p-10 lg:grid-cols-[1.2fr_auto] lg:p-12">
            <div>
              <p className="marketing-section-label mb-3 text-[#B88C33]">
                下一步
              </p>
              <h2 className="marketing-serif text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
                和我们聊一次企业 AI 业务诊断
              </h2>
              <p className="mt-4 max-w-xl text-base leading-8 text-white/70">
                你说说公司经验卡在哪、内容为什么断、AI
                有没有进入真实流程。我们一起找下一步的最小动作。
              </p>
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85">
                {ticks.map((label) => (
                  <li key={label} className="inline-flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-[#B88C33]" />
                    {label}
                  </li>
                ))}
              </ul>
              <WechatCtaButton className="mt-8 inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-7 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#B83F2B]">
                {MARKETING_PRIMARY_CTA}
                <ArrowRight className="ml-2 h-4 w-4" />
              </WechatCtaButton>
              <p className="mt-3 text-xs text-white/45">{MARKETING_WECHAT_NOTE}</p>
            </div>

            <WechatCtaButton className="mx-auto block w-[200px] cursor-pointer overflow-hidden rounded-xl border border-white/10 bg-white p-3 text-left shadow-2xl transition hover:scale-[1.02] lg:mx-0">
              <Image
                src={MARKETING_WECHAT_QR_PATH}
                alt="明远微信二维码"
                width={803}
                height={1024}
                className="h-auto w-full"
              />
              <span className="mt-2 block text-center text-xs font-medium text-[#5F5A52]">
                点击放大 · 扫码添加
              </span>
            </WechatCtaButton>
          </div>
        </div>
      </div>
    </section>
  )
}
