import type { Metadata } from "next"
import Link from "next/link"
import {
  coreTeam,
  deliveryLayers,
  technologyPartners,
} from "@/components/marketing/marketing-team-data"
import { WechatCtaButton } from "@/components/marketing/wechat-cta"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_LEGAL_ENTITY,
  MARKETING_SITE_ORIGIN,
} from "@/lib/marketing-brand"

export const metadata: Metadata = {
  title: `关于我们｜${MARKETING_COMPANY_NAME}`,
  description:
    "了解明动远见的核心团队、联合技术伙伴与企业专有智能体共建方式。",
  alternates: {
    canonical: `${MARKETING_SITE_ORIGIN}/about`,
  },
}

export default function AboutPage() {
  return (
    <main>
      <AboutHero />
      <DeliveryModelSection />
      <CoreTeamSection />
      <PartnersSection />
      <AboutCta />
    </main>
  )
}

function AboutHero() {
  return (
    <section className="border-b border-[#E8DED1] px-0 py-16 sm:py-20 lg:py-28">
      <div className="marketing-wrap grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
        <div>
          <p className="marketing-section-label">ABOUT MINGDONG VISION</p>
          <h1 className="marketing-hero-title mt-5 max-w-4xl text-[#25211D]">
            先懂业务
            <span className="block">让 AI 学会</span>
            <span className="block">企业的核心经验</span>
          </h1>
          <p className="mt-7 max-w-3xl text-base leading-8 text-[#5F5A52] sm:text-lg">
            明动远见是一家 AI 原生企业。我们从真实业务问题出发，把老板和专家已经验证过的判断、
            内容方法与交付经验，沉淀为团队可以持续使用的智能体资产。
          </p>
        </div>
        <div className="border-l border-[#D14A33] pl-6">
          <p className="text-xs font-semibold tracking-[0.12em] text-[#B88C33]">
            法律与交付主体
          </p>
          <p className="marketing-serif mt-3 text-2xl font-bold text-[#25211D]">
            {MARKETING_LEGAL_ENTITY}
          </p>
          <p className="mt-3 text-sm leading-7 text-[#6F675E]">
            统一负责商务沟通、项目管理、交付质量与客户验收。
          </p>
        </div>
      </div>
    </section>
  )
}

function DeliveryModelSection() {
  return (
    <section className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="marketing-section-label">HOW WE WORK</p>
            <h2 className="marketing-h-section mt-4 text-[#25211D]">
              团队价值不在人数，而在关键判断是否有人负责
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-8 text-[#5F5A52]">
            企业智能体不是单纯的软件开发，也不是一次培训。它需要同时理解商业目标、
            IP 与内容方法、组织知识和技术实施。我们用分层协作保证每个环节都有明确负责人。
          </p>
        </div>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[#E8DED1] bg-[#E8DED1] md:grid-cols-2 lg:grid-cols-4">
          {deliveryLayers.map((layer) => (
            <article key={layer.index} className="bg-[#FFFCF6] p-6">
              <span className="marketing-serif text-3xl text-[#D14A33]/30">
                {layer.index}
              </span>
              <h3 className="mt-6 text-lg font-semibold text-[#25211D]">
                {layer.title}
              </h3>
              <p className="mt-2 text-xs font-semibold text-[#B88C33]">
                {layer.owner}
              </p>
              <p className="mt-3 text-sm leading-6 text-[#6F675E]">
                {layer.description}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function CoreTeamSection() {
  return (
    <section className="bg-[#25211D] px-0 py-16 text-[#F8F2E9] sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <p className="marketing-section-label text-[#B88C33]">CORE TEAM</p>
        <h2 className="marketing-h-section mt-4 max-w-3xl">
          商业、操盘与内容产品三种能力共同进入项目
        </h2>
        <div className="mt-12 space-y-px overflow-hidden rounded-2xl border border-white/10 bg-white/10">
          {coreTeam.map((person, index) => (
            <article
              key={person.name}
              className="grid gap-6 bg-[#25211D] p-7 sm:p-9 lg:grid-cols-[90px_0.7fr_1.3fr]"
            >
              <span className="marketing-serif grid h-16 w-16 place-items-center rounded-full border border-[#D14A33] text-2xl text-[#E75B43]">
                {person.initials}
              </span>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B88C33]">
                  0{index + 1} · {person.role}
                </p>
                <h3 className="marketing-serif mt-3 text-2xl font-bold">
                  {person.name}
                </h3>
                <div className="mt-5 flex flex-wrap gap-2">
                  {person.strengths.map((strength) => (
                    <span
                      key={strength}
                      className="border border-white/10 px-2.5 py-1 text-[10px] text-white/55"
                    >
                      {strength}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-3">
                <p className="text-sm leading-7 text-white/70">{person.summary}</p>
                <p className="border-l border-[#D14A33] pl-4 text-sm leading-7 text-white/50">
                  项目职责：{person.responsibility}
                </p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function PartnersSection() {
  return (
    <section className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap grid gap-10 lg:grid-cols-[0.75fr_1.25fr]">
        <div>
          <p className="marketing-section-label">TECH DELIVERY PARTNERS</p>
          <h2 className="marketing-h-section mt-4 text-[#25211D]">
            需要工程能力时，由合适的人进入
          </h2>
          <p className="mt-5 text-sm leading-7 text-[#6F675E]">
            技术伙伴不是杭州宇米教育科技有限公司的全职成员。
            双方根据项目范围组成联合交付小组，由明动远见统一管理客户关系、任务边界和验收。
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {technologyPartners.map((partner) => (
            <article
              key={partner.name}
              className="rounded-2xl border border-[#E8DED1] bg-white/70 p-7"
            >
              <span className="marketing-serif grid h-12 w-12 place-items-center rounded-full bg-[#FFF0E9] text-[#D14A33]">
                {partner.initials}
              </span>
              <p className="mt-6 text-xs font-semibold text-[#B88C33]">
                {partner.role}
              </p>
              <h3 className="marketing-serif mt-2 text-2xl font-bold text-[#25211D]">
                {partner.name}
              </h3>
              <p className="mt-3 text-sm leading-7 text-[#6F675E]">
                {partner.summary}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function AboutCta() {
  return (
    <section className="border-t border-[#E8DED1] px-0 py-16 sm:py-20">
      <div className="marketing-wrap flex flex-col justify-between gap-8 rounded-2xl bg-[#F3EADF] p-8 sm:p-10 lg:flex-row lg:items-center">
        <div>
          <p className="marketing-section-label">START WITH ONE SCENE</p>
          <h2 className="marketing-h-section mt-3 text-[#25211D]">
            先聊清楚一个值得落地的业务场景
          </h2>
          <p className="mt-4 text-sm leading-7 text-[#6F675E]">
            我们会告诉你：谁负责、先做什么、如何验收，以及是否值得继续投入。
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <WechatCtaButton className="inline-flex min-h-12 cursor-pointer items-center justify-center bg-[#D14A33] px-6 text-sm font-semibold text-white hover:bg-[#B83F2B]">
            预约企业诊断
          </WechatCtaButton>
          <Link
            href="/cases"
            className="inline-flex min-h-12 items-center justify-center border border-[#D8CABA] bg-white px-6 text-sm font-semibold text-[#25211D]"
          >
            查看真实案例
          </Link>
        </div>
      </div>
    </section>
  )
}
