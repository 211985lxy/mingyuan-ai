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
            title="不是把项目交给技术，而是让懂业务的人共同定义结果"
            description="明动远见以商业诊断、IP 操盘与内容产品为核心，再按项目复杂度组织技术实施。客户始终面对一个清晰的项目负责人和一套统一的验收标准。"
            tone="dark"
          />
          <div className="border-l border-[#D14A33] pl-5 text-sm leading-7 text-white/60 lg:mb-14">
            杭州宇米教育科技有限公司作为签约与交付主体，对项目范围、质量和结果负责；
            联合技术伙伴按确认后的任务进入，不替代我方对客户的责任。
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
        <h3 className="marketing-serif mt-2 text-2xl font-bold">
          联合技术交付，不混淆组织边界
        </h3>
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
