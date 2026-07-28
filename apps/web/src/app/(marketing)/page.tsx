import type { Metadata } from "next"
import { HeroSection } from "@/components/marketing/hero-section"
import { PainPointsSection } from "@/components/marketing/pain-points-section"
import { HowItWorksSection } from "@/components/marketing/how-it-works-section"
import { BusinessStructureSection } from "@/components/marketing/business-structure-section"
import { FeaturesSection } from "@/components/marketing/features-section"
import { CaseEvidenceSection } from "@/components/marketing/case-evidence-section"
import { TeamSection } from "@/components/marketing/team-section"
import { DifferentiatorsSection } from "@/components/marketing/differentiators-section"
import { CooperationPathSection } from "@/components/marketing/cooperation-path-section"
import { CTASection } from "@/components/marketing/cta-section"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_LEGAL_ENTITY,
  MARKETING_PRODUCT_NAME,
  MARKETING_PRODUCT_NAME_COMPACT,
  MARKETING_SITE_ORIGIN,
} from "@/lib/marketing-brand"

export const metadata: Metadata = {
  title: `${MARKETING_COMPANY_NAME}｜企业专有智能体资产共建`,
  description: `${MARKETING_COMPANY_NAME}（法律主体：${MARKETING_LEGAL_ENTITY}）帮助企业把老板经验变成可调用、可迭代的智能体资产。核心产品 ${MARKETING_PRODUCT_NAME}，首要转化：添加微信预约企业 AI 业务诊断。`,
  openGraph: {
    title: `${MARKETING_COMPANY_NAME}｜企业专有智能体资产共建`,
    description: `品牌 ${MARKETING_COMPANY_NAME} · 产品 ${MARKETING_PRODUCT_NAME} · 企业专有智能体资产共建`,
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "zh_CN",
    type: "website",
    url: MARKETING_SITE_ORIGIN,
  },
  alternates: {
    canonical: `${MARKETING_SITE_ORIGIN}/`,
    languages: {
      "zh-CN": `${MARKETING_SITE_ORIGIN}/`,
      "x-default": `${MARKETING_SITE_ORIGIN}/`,
    },
  },
}

export default function MarketingPage() {
  const jsonLdOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: MARKETING_COMPANY_NAME,
    legalName: MARKETING_LEGAL_ENTITY,
    url: MARKETING_SITE_ORIGIN,
    description:
      "明动远见帮助企业把老板与专家经验变成可调用、可迭代的智能体资产，核心产品为明远 AIM。",
    brand: {
      "@type": "Brand",
      name: MARKETING_COMPANY_NAME,
    },
    makesOffer: {
      "@type": "Offer",
      itemOffered: {
        "@type": "SoftwareApplication",
        name: MARKETING_PRODUCT_NAME_COMPACT,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        description:
          "明远 AIM 是面向企业 IP 内容生产的智能体工作台，学习老板经验、持续做内容，并按真实结果优化。",
      },
    },
  }

  const jsonLdFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "明动远见和明远 AIM 是什么关系？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "明动远见是品牌名，日常可简称明动；法律主体为杭州宇米教育科技有限公司。明远 AIM 是核心产品，用于企业专有智能体与内容获客工作台。",
        },
      },
      {
        "@type": "Question",
        name: "如何预约企业 AI 业务诊断？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "在官网点击「添加微信，预约诊断」，扫码添加明远微信，并备注「企业诊断」。",
        },
      },
      {
        "@type": "Question",
        name: "明动远见适合什么样的企业？",
        acceptedAnswer: {
          "@type": "Answer",
          text: "适合知识密集、强信任、高客单的专业服务企业，尤其是老板愿意参与、业务已有验证、希望把经验装进真实工作流程的团队。",
        },
      },
    ],
  }

  return (
    <main className="flex flex-col">
      <h1 className="sr-only">
        {MARKETING_COMPANY_NAME} - 让 AI 学会老板的经验，帮助企业持续获得客户
      </h1>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrg) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdFaq) }}
      />

      <HeroSection />
      <PainPointsSection />
      <HowItWorksSection />
      <BusinessStructureSection />
      <FeaturesSection />
      <CaseEvidenceSection />
      <TeamSection />
      <DifferentiatorsSection />
      <CooperationPathSection />
      <CTASection />
    </main>
  )
}
