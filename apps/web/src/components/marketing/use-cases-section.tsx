"use client"

import { useTranslations } from "next-intl"
import {
  ShoppingBag,
  Store,
  GraduationCap,
  Megaphone,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface UseCase {
  titleKey: string
  descKey: string
  statKey: string
  Icon: LucideIcon
  gradient: string
}

const useCases: UseCase[] = [
  {
    titleKey: "case1Title",
    descKey: "case1Desc",
    statKey: "case1Stat",
    Icon: ShoppingBag,
    gradient: "bg-[#D14A33]",
  },
  {
    titleKey: "case2Title",
    descKey: "case2Desc",
    statKey: "case2Stat",
    Icon: Store,
    gradient: "bg-[#B88C33]",
  },
  {
    titleKey: "case3Title",
    descKey: "case3Desc",
    statKey: "case3Stat",
    Icon: GraduationCap,
    gradient: "bg-[#25211D]",
  },
  {
    titleKey: "case4Title",
    descKey: "case4Desc",
    statKey: "case4Stat",
    Icon: Megaphone,
    gradient: "bg-[#6B7A4A]",
  },
]

export function UseCasesSection() {
  const t = useTranslations("UseCases")

  return (
    <section id="use-cases" className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="mb-4 text-2xl font-bold text-[#25211D] sm:text-3xl lg:text-4xl">
            {t("heading")}
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-[#5F5A52]">
            {t("subheading")}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {useCases.map(({ titleKey, descKey, statKey, Icon, gradient }) => (
            <div
              key={titleKey}
              className="jade-emboss group relative flex flex-col rounded-xl border border-[#E8DED1] bg-white p-6 hover:border-[#D14A33]/30"
            >
              <div
                className={`mb-5 flex h-12 w-12 items-center justify-center rounded-lg ${gradient} text-white shadow-lg`}
              >
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[#25211D]">{t(titleKey)}</h3>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-[#6F675E]">
                {t(descKey)}
              </p>
              <div className="border-t border-[#EFE7DC] pt-4">
                <span className="text-sm font-semibold text-[#D14A33]">{t(statKey)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
