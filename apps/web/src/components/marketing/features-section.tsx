"use client"

import { useTranslations } from "next-intl"
import {
  BriefcaseBusiness,
  Mic2,
  PencilLine,
  MessageCircleQuestion,
  Compass,
  Layers,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface Feature {
  titleKey: string
  descKey: string
  tagKey: string
  Icon: LucideIcon
}

const features: Feature[] = [
  { titleKey: "feature1Title", descKey: "feature1Desc", tagKey: "feature1Tag", Icon: BriefcaseBusiness },
  { titleKey: "feature2Title", descKey: "feature2Desc", tagKey: "feature2Tag", Icon: Mic2 },
  { titleKey: "feature3Title", descKey: "feature3Desc", tagKey: "feature3Tag", Icon: PencilLine },
  { titleKey: "feature4Title", descKey: "feature4Desc", tagKey: "feature4Tag", Icon: MessageCircleQuestion },
  { titleKey: "feature5Title", descKey: "feature5Desc", tagKey: "feature5Tag", Icon: Compass },
  { titleKey: "feature6Title", descKey: "feature6Desc", tagKey: "feature6Tag", Icon: Layers },
]

export function FeaturesSection() {
  const t = useTranslations("Features")

  return (
    <section id="features" className="bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="mb-12 text-center sm:mb-16">
          <h2 className="mb-4 text-2xl font-bold text-[#25211D] sm:text-3xl lg:text-4xl">
            {t("heading")}
          </h2>
          <p className="mx-auto max-w-3xl text-lg text-[#5F5A52]">
            {t("subheading")}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {features.map(({ titleKey, descKey, tagKey, Icon }) => (
            <div
              key={titleKey}
              className="group jade-emboss flex flex-col gap-4 rounded-xl border border-[#E8DED1] bg-white p-6 sm:p-7"
            >
              <div className="flex items-center gap-3">
                <div className="seal-icon h-10 w-10">
                  <Icon className="h-5 w-5" />
                </div>
                <Badge variant="secondary" className="text-xs font-medium">
                  {t(tagKey)}
                </Badge>
              </div>
              <h3 className="text-lg font-semibold text-[#25211D]">{t(titleKey)}</h3>
              <p className="text-sm leading-relaxed text-[#6F675E]">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
