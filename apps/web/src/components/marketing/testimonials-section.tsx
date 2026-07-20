"use client"

import { useTranslations } from "next-intl"
import { Quote, TrendingUp } from "lucide-react"

interface Testimonial {
  quoteKey: string
  nameKey: string
  roleKey: string
  metricKey: string
  initials: string
  color: string
}

const testimonials: Testimonial[] = [
  {
    quoteKey: "t1Quote",
    nameKey: "t1Name",
    roleKey: "t1Role",
    metricKey: "t1Metric",
    initials: "ZW",
    color: "bg-[#D14A33]",
  },
  {
    quoteKey: "t2Quote",
    nameKey: "t2Name",
    roleKey: "t2Role",
    metricKey: "t2Metric",
    initials: "LT",
    color: "bg-[#B88C33]",
  },
  {
    quoteKey: "t3Quote",
    nameKey: "t3Name",
    roleKey: "t3Role",
    metricKey: "t3Metric",
    initials: "WK",
    color: "bg-[#25211D]",
  },
]

/**
 * @description testimonialssection
 * @returns 无返回值
 */
export function TestimonialsSection() {
  const t = useTranslations("Testimonials")

  return (
    <section className="bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-12 text-center text-2xl font-bold text-[#25211D] sm:mb-16 sm:text-3xl lg:text-4xl">
          {t("heading")}
        </h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {testimonials.map(({ quoteKey, nameKey, roleKey, metricKey, initials, color }) => (
            <div
              key={quoteKey}
              className="jade-emboss relative flex flex-col rounded-xl border border-[#E8DED1] bg-white p-6 sm:p-8"
            >
              <Quote className="mb-4 h-8 w-8 text-[#D14A33]/20" />
              <blockquote className="mb-6 flex-1 leading-relaxed text-[#25211D]">
                &ldquo;{t(quoteKey)}&rdquo;
              </blockquote>
              {/* 结果指标徽章 */}
              <div className="mb-4 inline-flex w-fit items-center gap-1.5 rounded-lg bg-[#D14A33]/8 px-3 py-1.5 text-xs font-semibold text-[#B83F2B]">
                <TrendingUp className="h-3.5 w-3.5" />
                {t(metricKey)}
              </div>
              <div className="flex items-center gap-3 border-t border-[#EFE7DC] pt-4">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full ${color} text-sm font-semibold text-white`}
                >
                  {initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#25211D]">{t(nameKey)}</p>
                  <p className="text-xs text-[#8A8175]">{t(roleKey)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
