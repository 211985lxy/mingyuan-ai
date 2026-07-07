"use client"

import { useTranslations } from "next-intl"
import { BookOpen, Brain, DatabaseZap, FileText, MessageSquareText, ChevronRight } from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface Step {
  num: number
  titleKey: string
  descKey: string
  Icon: LucideIcon
}

const steps: Step[] = [
  { num: 1, titleKey: "step1Title", descKey: "step1Desc", Icon: BookOpen },
  { num: 2, titleKey: "step2Title", descKey: "step2Desc", Icon: DatabaseZap },
  { num: 3, titleKey: "step3Title", descKey: "step3Desc", Icon: Brain },
  { num: 4, titleKey: "step4Title", descKey: "step4Desc", Icon: FileText },
  { num: 5, titleKey: "step5Title", descKey: "step5Desc", Icon: MessageSquareText },
]

export function HowItWorksSection() {
  const t = useTranslations("HowItWorks")

  return (
    <section id="how-it-works" className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="mb-4 text-2xl font-bold text-[#25211D] sm:text-3xl lg:text-4xl">
            {t("heading")}
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-[#5F5A52]">
            {t("subheading")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-5">
          {steps.map(({ num, titleKey, descKey, Icon }, idx) => (
            <div key={num} className="relative flex flex-col items-center">
              <div className="jade-emboss flex h-full w-full flex-col items-center gap-5 rounded-xl border border-[#E8DED1] bg-white p-5 text-center hover:border-[#D14A33]/30">
                <div className="relative">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#25211D] text-white shadow-lg shadow-[#25211D]/10">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#B88C33] text-xs font-bold text-white shadow-sm">
                    {num}
                  </span>
                </div>
                <div>
                  <h3 className="mb-2 text-base font-semibold text-[#25211D]">{t(titleKey)}</h3>
                  <p className="text-sm leading-relaxed text-[#6F675E]">{t(descKey)}</p>
                </div>
              </div>
              {idx < steps.length - 1 && (
                <div className="absolute -right-4 top-1/2 z-10 hidden -translate-y-1/2 md:flex">
                  <ChevronRight className="h-5 w-5 text-[#D14A33]/40" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
