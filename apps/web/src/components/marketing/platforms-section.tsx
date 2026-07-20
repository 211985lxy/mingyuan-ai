"use client"

import { useTranslations } from "next-intl"
import {
  MessageCircle,
  BookOpen,
  BriefcaseBusiness,
  FileText,
  MessageSquareQuote,
  PackageCheck,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

interface Platform {
  nameKey: string
  Icon: LucideIcon
}

const platforms: Platform[] = [
  { nameKey: "businessDocs", Icon: BookOpen },
  { nameKey: "founderKnowhow", Icon: MessageSquareQuote },
  { nameKey: "projectCases", Icon: BriefcaseBusiness },
  { nameKey: "productSellingPoints", Icon: PackageCheck },
  { nameKey: "customerQa", Icon: MessageCircle },
  { nameKey: "salesScripts", Icon: FileText },
]

/**
 * @description platformssection
 * @returns 无返回值
 */
export function PlatformsSection() {
  const t = useTranslations("Platforms")

  return (
    <section className="border-y border-[#E8DED1] bg-white px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="mb-8 text-center text-sm font-semibold tracking-wide text-[#8A8175]">
          {t("heading")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-5 sm:gap-8 lg:gap-10">
          {platforms.map(({ nameKey, Icon }) => (
            <div
              key={nameKey}
              className="jade-emboss flex cursor-default items-center gap-2.5 rounded-full border border-[#EFE7DC] bg-[#FAF8F3] px-4 py-2 text-[#5F5A52] hover:border-[#D14A33]/30 hover:text-[#D14A33]"
            >
              <Icon className="h-5 w-5" />
              <span className="text-sm font-medium">{t(nameKey)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
