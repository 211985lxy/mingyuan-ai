"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useBranding } from "@/components/providers/branding-provider"
import {
  ArrowRight,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  Check,
  MessageSquareText,
  Play,
  Quote,
  Sparkles,
  Wand2,
} from "lucide-react"

const inputs = [
  { labelKey: "businessDocs", Icon: BookOpen },
  { labelKey: "founderKnowhow", Icon: Quote },
  { labelKey: "projectCases", Icon: BriefcaseBusiness },
  { labelKey: "customerQa", Icon: MessageSquareText },
]

const outputs = [
  "heroOutput1",
  "heroOutput2",
  "heroOutput3",
  "heroOutput4",
] as const

/**
 * @description herosection
 * @returns 无返回值
 */
export function HeroSection() {
  const t = useTranslations("Hero")
  const tP = useTranslations("Platforms")
  const branding = useBranding()
  const profileOnce = t("profileOnce")

  return (
    <section className="relative overflow-hidden bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
      {/* 背景晕染：火土东方光晕 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(60% 55% at 85% 0%, oklch(0.575 0.205 28.0 / 0.10), transparent 70%), radial-gradient(45% 45% at 0% 20%, oklch(0.745 0.185 38.0 / 0.10), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_520px]">
        {/* 左：文案与行动 */}
        <div>
          {/* 徽章 */}
          <div className="badge-gold mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4" />
            {t("badge")}
          </div>

          {/* 眉题 */}
          <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#B88C33]">
            {t("eyebrow")}
          </p>

          {/* 主标题：高对比、大号、群响式压迫感 */}
          <h1 className="max-w-3xl break-words text-4xl font-bold leading-[1.08] tracking-tight text-[#25211D] sm:text-5xl lg:text-6xl">
            {t("title")}
            <br />
            <span className="block break-all text-[#D14A33]">
              {t("titleHighlight")}
            </span>
          </h1>

          {/* 副标题 */}
          <p className="mt-6 max-w-2xl text-base leading-8 text-[#5F5A52] sm:text-lg">
            {t("subtitle", { name: branding.name })}
          </p>

          {profileOnce ? (
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-[#D14A33]/15 bg-white/70 px-3.5 py-2 text-sm font-medium text-[#25211D] shadow-sm backdrop-blur">
              <span className="seal-icon h-5! w-5!">
                <Check className="h-3.5 w-3.5" />
              </span>
              {profileOnce}
            </div>
          ) : null}

          {/* CTAs */}
          <div className="mt-8 flex flex-col gap-4 sm:flex-row">
            <Link
              href="/register"
              className="jade-emboss inline-flex w-full cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#D14A33]/25 transition-colors duration-200 hover:bg-[#B83F2B] sm:w-auto"
            >
              {t("cta")}
              <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
            <Link
              href="/login"
              className="jade-emboss inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-[#D14A33]/25 bg-white px-8 py-4 text-base font-semibold text-[#25211D] transition-colors duration-200 hover:bg-[#FFF8F4] sm:w-auto"
            >
              <Play className="mr-2 h-5 w-5 text-[#D14A33]" />
              {t("ctaSecondary")}
            </Link>
          </div>

          {/* 信任条：三项并列 */}
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-medium text-[#8A8175]">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base font-bold text-[#D14A33]">3,000+</span>
              {t("trustBusiness")}
            </span>
            <span className="hidden h-4 w-px bg-[#E8DED1] sm:inline-block" />
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base font-bold text-[#D14A33]">7</span>
              {t("trustLoop")}
            </span>
            <span className="hidden h-4 w-px bg-[#E8DED1] sm:inline-block" />
            <span>{t("trustBrowser")}</span>
          </div>
        </div>

        {/* 右：产品可视化卡片（带动效） */}
        <div className="dao-shimmer relative rounded-2xl border border-[#E8DED1] bg-white p-5 shadow-2xl shadow-[#8C4A2F]/15 lg:p-6">
          {/* 卡片头 */}
          <div className="flex items-center justify-between border-b border-[#EFE7DC] pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#B88C33]">
                {t("panelLabel")}
              </p>
              <p className="mt-1 text-lg font-bold text-[#25211D]">
                {t("panelTitle")}
              </p>
            </div>
            <div className="fire-pulse-ring flex h-12 w-12 items-center justify-center rounded-xl bg-[#D14A33]/10">
              <Brain className="h-6 w-6 text-[#D14A33]" />
            </div>
          </div>

          {/* 输入资产 */}
          <div className="grid gap-3 py-5 sm:grid-cols-2">
            {inputs.map(({ labelKey, Icon }) => (
              <div
                key={labelKey}
                className="rounded-lg border border-[#EFE7DC] bg-[#FAF8F3] p-4 transition-colors duration-200 hover:border-[#D14A33]/30"
              >
                <Icon className="mb-3 h-5 w-5 text-[#B88C33]" />
                <p className="text-sm font-semibold text-[#25211D]">{tP(labelKey)}</p>
                <p className="mt-1 text-xs text-[#777066]">{t("panelInputs")}</p>
              </div>
            ))}
          </div>

          {/* AI 转化箭头条 */}
          <div className="mb-4 flex items-center justify-center gap-2 text-xs font-semibold text-[#B88C33]">
            <Wand2 className="h-4 w-4" />
            <span>{t("panelStatus")}</span>
            <span className="gold-flow-progress h-1 w-16 overflow-hidden rounded-full" />
          </div>

          {/* 输出 */}
          <div className="rounded-xl bg-[#25211D] p-5 text-white">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold">{t("panelOutputs")}</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {t("panelStatus")}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {outputs.map((item) => (
                <div
                  key={item}
                  className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white/90 transition-colors duration-200 hover:bg-white/15"
                >
                  {t(item)}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
