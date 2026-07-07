"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, Check } from "lucide-react"

const ticks = [
  "ctaTick1",
  "ctaTick2",
  "ctaTick3",
] as const

export function CTASection() {
  const t = useTranslations("CTA")

  return (
    <section className="bg-dawn-mountain relative overflow-hidden px-4 py-20 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
      {/* 高光晕染 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(45% 60% at 50% -10%, rgba(255,255,255,0.18), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl text-center">
        <h2 className="mb-6 text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-4xl">
          {t("heading")}
        </h2>
        <p className="mb-8 text-base leading-relaxed text-white/85 sm:text-lg">
          {t("subtext")}
        </p>

        {/* 承诺三连 */}
        <ul className="mb-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium text-white/90">
          {ticks.map((tk) => (
            <li key={tk} className="inline-flex items-center gap-1.5">
              <Check className="h-4 w-4 text-white" />
              {t(tk)}
            </li>
          ))}
        </ul>

        <Link
          href="/register"
          className="jade-emboss inline-flex cursor-pointer items-center justify-center rounded-lg bg-white px-10 py-4 text-base font-bold text-[#B83F2B] shadow-2xl shadow-black/20 transition-colors duration-200 hover:bg-[#FFF1EC] sm:text-lg"
        >
          {t("button")}
          <ArrowRight className="ml-2 h-5 w-5" />
        </Link>
        <p className="mt-4 text-sm text-white/70">{t("note")}</p>
      </div>
    </section>
  )
}
