"use client"

import { useTranslations } from "next-intl"
import { CheckCircle, Sparkles } from "lucide-react"

interface Diff {
  titleKey: string
  descKey: string
  highlight?: boolean
}

const diffs: Diff[] = [
  { titleKey: "diff0Title", descKey: "diff0Desc", highlight: true },
  { titleKey: "diff1Title", descKey: "diff1Desc" },
  { titleKey: "diff2Title", descKey: "diff2Desc" },
  { titleKey: "diff3Title", descKey: "diff3Desc" },
  { titleKey: "diff4Title", descKey: "diff4Desc" },
  { titleKey: "diff5Title", descKey: "diff5Desc" },
  { titleKey: "diff6Title", descKey: "diff6Desc" },
]

/**
 * @description differentiatorssection
 * @returns 无返回值
 */
export function DifferentiatorsSection() {
  const t = useTranslations("Differentiators")

  return (
    <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center sm:mb-16">
          <h2 className="mb-4 text-2xl font-bold text-[#25211D] sm:text-3xl lg:text-4xl">
            {t("heading")}
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-[#5F5A52]">
            {t("subheading")}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {diffs.map(({ titleKey, descKey, highlight }) =>
            highlight ? (
              // 首卡：高亮「档案只配一次」卖点，跨列强调
              <div
                key={titleKey}
                className="dao-shimmer jade-emboss flex items-start gap-4 rounded-xl bg-fire-earth-gradient p-6 text-white sm:col-span-2 lg:col-span-1"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="mb-1 text-lg font-bold">{t(titleKey)}</h3>
                  <p className="text-sm leading-relaxed text-white/90">
                    {t(descKey)}
                  </p>
                </div>
              </div>
            ) : (
              <div
                key={titleKey}
                className="jade-emboss flex items-start gap-4 rounded-xl border border-[#E8DED1] bg-[#FAF8F3] p-6"
              >
                <div className="seal-icon mt-0.5 h-8 w-8">
                  <CheckCircle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="mb-1 text-base font-semibold text-[#25211D]">
                    {t(titleKey)}
                  </h3>
                  <p className="text-sm leading-relaxed text-[#6F675E]">
                    {t(descKey)}
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  )
}
