import Link from "next/link"
import {
  coreTeam,
  technologyPartners,
} from "./marketing-team-data"
import { MarketingSectionHeader } from "./section-header"

/**
 * @description Homepage team overview focused on delivery trust, not résumés.
 */
export function TeamSection() {
  return (
    <section className="bg-[#25211D] px-0 py-16 text-[#F8F2E9] sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="grid gap-8 border-b border-white/10 pb-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-end">
          <MarketingSectionHeader
            label="TEAM · BUSINESS FIRST"
            title="商业、IP 操盘、内容产品与智能体工程共同进入项目"
            description="先把客户目标、方法与验收标准定义清楚，再让每一种专业能力围绕同一个业务结果协同。"
            tone="dark"
          />
          <div className="border-l border-[#D14A33] pl-5 text-sm leading-7 text-white/60 lg:mb-14">
            明动远见统一负责商业方案、项目推进、交付质量与客户验收，确保业务判断和技术实现始终在同一条线上。
          </div>
        </div>

        <CoreTeamGrid />
        <TechnologyPartnerStrip />

        <Link
          href="/about"
          className="mt-8 inline-flex text-sm font-semibold text-[#E75B43] hover:underline"
        >
          了解团队分工与交付方式 →
        </Link>
      </div>
    </section>
  )
}

function CoreTeamGrid() {
  return (
    <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 lg:grid-cols-3">
      {coreTeam.map((person) => (
        <article
          key={person.name}
          className="flex min-h-[320px] flex-col bg-[#25211D] p-7 sm:p-8"
        >
          <div className="flex items-start justify-between gap-5">
            <span className="marketing-serif grid h-14 w-14 place-items-center rounded-full border border-[#D14A33] text-xl text-[#E75B43]">
              {person.initials}
            </span>
            <span className="max-w-[170px] text-right text-[10px] font-semibold uppercase tracking-[0.12em] text-[#B88C33]">
              {person.role}
            </span>
          </div>
          <h3 className="marketing-serif mt-8 text-2xl font-bold">{person.name}</h3>
          <p className="mt-3 text-sm leading-7 text-white/65">{person.summary}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-7">
            {person.strengths.map((strength) => (
              <span
                key={strength}
                className="border border-white/10 px-2.5 py-1 text-[10px] text-white/55"
              >
                {strength}
              </span>
            ))}
          </div>
        </article>
      ))}
    </div>
  )
}

function TechnologyPartnerStrip() {
  return (
    <div className="mt-8 grid gap-6 border border-white/10 bg-black/10 p-6 sm:p-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
      <div>
        <p className="marketing-section-label text-[#B88C33]">EXTENDED DELIVERY</p>
        <h3 className="marketing-serif mt-2 text-2xl font-bold">智能体工程与工作流能力</h3>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {technologyPartners.map((partner) => (
          <div key={partner.name} className="flex gap-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/5 text-sm text-[#E75B43]">
              {partner.initials}
            </span>
            <div>
              <p className="font-semibold">{partner.name}</p>
              <p className="mt-1 text-xs text-[#B88C33]">{partner.role}</p>
              <p className="mt-1 text-xs leading-5 text-white/50">
                {partner.summary}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
