import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_SITE_ORIGIN,
} from "@/lib/marketing-brand"
import { InternalPracticeEvidence } from "@/components/marketing/internal-practice-evidence"
import { WechatCtaButton } from "@/components/marketing/wechat-cta"

export const metadata: Metadata = {
  title: `客户案例｜${MARKETING_COMPANY_NAME}`,
  description: "查看 IP 智能体如何在真实业务中连接内容触达、精准客户、商品承接与成交结果。所有外部案例均采用行业匿名。",
  alternates: { canonical: `${MARKETING_SITE_ORIGIN}/cases` },
}

const financeMetrics = [
  { value: "4000+", label: "单月精准线索" },
  { value: "数百万元", label: "项目月度业务规模" },
  { value: "20+", label: "账号矩阵协同" },
  { value: "2257 笔", label: "统计期低客单入口订单" },
]

const trackRecord = [
  { value: "100+", label: "老板与专家服务经验" },
  { value: "10 亿+", label: "全网累计内容曝光" },
  { value: "2000 万+", label: "IP 项目累计变现" },
  { value: "3 亿+", label: "营销招商项目累计变现" },
]

const industryCases = [
  {
    code: "01",
    category: "家庭教育",
    title: "青少年心理专家 IP",
    result: "500 万+",
    label: "家长社群月均业务转化",
    description: "围绕家长决策、青少年成长与专业信任组织内容和社群承接。",
  },
  {
    code: "02",
    category: "大健康",
    title: "中医养生专家 IP",
    result: "200 万+",
    label: "单场成交",
    description: "用专家内容建立认知，再通过活动完成高信任业务转化。",
  },
  {
    code: "03",
    category: "女性成长",
    title: "身心成长导师 IP",
    result: "30%+",
    label: "高净值用户转化率",
    description: "围绕明确人群、真实议题与长期信任设计内容和承接路径。",
  },
]

export default function CasesPage() {
  return (
    <main>
      <section className="border-b border-[#E8DED1] px-0 py-16 sm:py-20 lg:py-28">
        <div className="marketing-wrap grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="marketing-section-label">CASES · REAL BUSINESS</p>
            <h1 className="marketing-hero-title mt-5 text-[#25211D]">
              结果不是多写了多少篇，
              <em className="block">而是连接了多少目标客户</em>
            </h1>
          </div>
          <p className="max-w-2xl text-base leading-8 text-[#5F5A52] lg:justify-self-end">
            我们把内容触达、专业信任、客户线索和商业承接放在同一个案例里。外部项目采用行业匿名，保留关键动作与可核验结果。
          </p>
        </div>
      </section>

      <AnonCashflowCase financeMetrics={financeMetrics} />

      <CoreOperatingExperience trackRecord={trackRecord} industryCases={industryCases} />

      <InternalPracticeEvidence />

      <section className="px-0 py-16 sm:py-20">
        <div className="marketing-wrap flex flex-col justify-between gap-8 rounded-2xl bg-[#F3EADF] p-8 sm:p-10 lg:flex-row lg:items-center">
          <div>
            <p className="marketing-section-label">YOUR CASE</p>
            <h2 className="marketing-h-section mt-3 text-[#25211D]">先判断你的业务，适不适合做 IP 智能体</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <WechatCtaButton className="inline-flex min-h-12 cursor-pointer items-center justify-center bg-[#D14A33] px-6 text-sm font-semibold text-white hover:bg-[#B83F2B]">
              预约企业诊断 <ArrowRight className="ml-2 h-4 w-4" />
            </WechatCtaButton>
            <Link href="/ip-agent" className="inline-flex min-h-12 items-center justify-center border border-[#D8CABA] bg-white px-6 text-sm font-semibold text-[#25211D]">了解 IP 智能体</Link>
          </div>
        </div>
      </section>
    </main>
  )
}

type Metric = { value: string; label: string }

function AnonCashflowCase({ financeMetrics }: { financeMetrics: ReadonlyArray<Metric> }) {
  return (
    <section className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="marketing-section-label">CASE 01 · 匿名客户项目</p>
            <h2 className="marketing-h-section mt-4 text-[#25211D]">企业现金流与财商顾问 IP 增长案例</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[#6F675E] lg:justify-self-end">
            专业 IP 操盘决定定位、内容标准与商业承接；IP 智能体承担研究准备、文案生产和多版本适配，让一个人的判断支持更多内容和更多账号持续运行。
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#DDD2C2] bg-[#DDD2C2] lg:grid-cols-4">
          {financeMetrics.map((item) => (
            <div key={item.label} className="bg-[#F8F2E9] px-5 py-6 sm:px-7 sm:py-8">
              <p className="marketing-serif text-2xl font-bold text-[#D14A33] sm:text-3xl">{item.value}</p>
              <p className="mt-2 text-xs leading-5 text-[#655D54]">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-[#E8DED1] bg-[#E8DED1] lg:grid-cols-3">
          {[
            ["业务背景", "服务面向中小企业老板，客单价高、决策周期长，需要通过持续专业内容建立信任。"],
            ["原有卡点", "观点和案例依赖本人，矩阵账号需要大量研究、写作、审核与平台适配。"],
            ["人机协同", "操盘手负责定位、判断和转化路径；IP 智能体放大研究、文案与矩阵执行效率。"],
          ].map(([title, desc]) => (
            <article key={title} className="bg-[#FFFCF6] p-6 sm:p-8">
              <h3 className="text-lg font-semibold text-[#25211D]">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#6F675E]">{desc}</p>
            </article>
          ))}
        </div>

        <article className="mt-8 overflow-hidden rounded-2xl border border-[#E5DED3] bg-[#FAF8F3]">
          <div className="relative aspect-[1.72/1] bg-white">
            <Image
              src="/marketing/case-evidence/cashflow-entry-orders.jpg"
              alt="匿名企业财商项目低客单入口成交后台"
              fill
              sizes="(min-width: 1024px) 1200px, 100vw"
              className="object-contain"
            />
          </div>
          <div className="grid gap-4 border-t border-[#E5DED3] p-6 sm:p-8 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-[#B88C33]">交易承接证据</p>
              <h3 className="mt-2 text-xl font-bold text-[#25211D]">内容之后，有真实交易发生</h3>
            </div>
            <p className="text-sm leading-7 text-[#655D54]">
              2026 年 4 月 28 日至 5 月 27 日，低客单入口完成 2257 笔成交订单、2209 名成交用户。它证明内容触达之后存在真实承接，不代表项目全部商业转化规模。
            </p>
          </div>
        </article>

        <p className="mt-5 text-xs leading-6 text-[#8A8175]">
          项目结果由 IP 本人、操盘策略、团队执行、产品和市场环境共同形成；AI 是效率杠杆，不构成对其他项目的效果承诺。公开版本已隐藏客户身份和敏感业务字段。
        </p>
      </div>
    </section>
  )
}

type IndustryCase = {
  code: string
  category: string
  title: string
  result: string
  label: string
  description: string
}

function CoreOperatingExperience({
  trackRecord,
  industryCases,
}: {
  trackRecord: ReadonlyArray<Metric>
  industryCases: ReadonlyArray<IndustryCase>
}) {
  return (
    <section className="border-y border-[#E8DED1] bg-[#F3EEE5] px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="max-w-3xl">
          <p className="marketing-section-label">CORE OPERATING EXPERIENCE</p>
          <h2 className="marketing-h-section mt-4 text-[#25211D]">不同行业，最终都要回到客户与业务结果</h2>
          <p className="mt-5 text-sm leading-7 text-[#655D54]">以下为已授权的过往项目成果摘要，官网采用行业匿名，完整材料在正式商务沟通中按需核验。</p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#DDD2C2] bg-[#DDD2C2] lg:grid-cols-4">
          {trackRecord.map((item) => (
            <div key={item.label} className="bg-[#FAF8F3] px-5 py-6 sm:px-7 sm:py-8">
              <p className="marketing-serif text-2xl font-bold text-[#25211D] sm:text-3xl">{item.value}</p>
              <p className="mt-2 text-xs leading-5 text-[#746B61]">{item.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-3">
          {industryCases.map((item) => (
            <article key={item.code} className="rounded-2xl border border-[#DDD2C2] bg-[#FAF8F3] p-6 sm:p-8">
              <p className="text-xs font-semibold tracking-[0.18em] text-[#B88C33]">CASE {item.code} · {item.category}</p>
              <h3 className="mt-5 text-xl font-bold text-[#25211D]">{item.title}</h3>
              <div className="mt-7 border-y border-[#E4D9CA] py-5">
                <p className="marketing-serif text-3xl font-bold text-[#D14A33]">{item.result}</p>
                <p className="mt-2 text-sm font-medium text-[#5F574F]">{item.label}</p>
              </div>
              <p className="mt-5 text-sm leading-7 text-[#6F675E]">{item.description}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
