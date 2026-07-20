"use client"

import { useTranslations } from "next-intl"

interface Stat {
  valueKey: string
  labelKey: string
}

const stats: Stat[] = [
  { valueKey: "stat1Value", labelKey: "stat1Label" },
  { valueKey: "stat2Value", labelKey: "stat2Label" },
  { valueKey: "stat3Value", labelKey: "stat3Label" },
  { valueKey: "stat4Value", labelKey: "stat4Label" },
]

/**
 * @description statssection
 * @returns 无返回值
 */
export function StatsSection() {
  const t = useTranslations("Stats")

  return (
    <section className="bg-dawn-mountain relative overflow-hidden px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      {/* 暗角晕染，增强纵深 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 120%, rgba(0,0,0,0.35), transparent 70%)",
        }}
      />
      <div className="relative mx-auto max-w-7xl">
        <h2 className="mb-12 max-w-3xl text-center text-2xl font-bold text-white sm:mb-16 sm:text-3xl lg:mx-auto lg:text-4xl">
          {t("heading")}
        </h2>
        <div className="grid grid-cols-2 gap-5 sm:gap-6 lg:grid-cols-4">
          {stats.map(({ valueKey, labelKey }) => (
            <div
              key={valueKey}
              className="jade-emboss flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-8 text-center backdrop-blur-sm sm:py-10"
            >
              <span className="gold-champion-badge text-4xl font-extrabold sm:text-5xl lg:text-6xl">
                {t(valueKey)}
              </span>
              <span className="text-sm font-medium text-white/80 sm:text-base">
                {t(labelKey)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
