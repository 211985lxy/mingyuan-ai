import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Check } from "lucide-react"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_PRODUCT_NAME,
  MARKETING_SITE_ORIGIN,
} from "@/lib/marketing-brand"
import { WechatCtaButton } from "@/components/marketing/wechat-cta"

export const metadata: Metadata = {
  title: `IP 智能体｜${MARKETING_COMPANY_NAME}`,
  description: `把老板和专家已经验证过的定位、观点、案例与表达方法，转成团队可持续使用的内容获客能力。`,
  alternates: { canonical: `${MARKETING_SITE_ORIGIN}/ip-agent` },
}

const outcomes = [
  { value: "更像本人", label: "调用真实观点、案例与表达边界" },
  { value: "更懂业务", label: "围绕目标客户和产品设计内容" },
  { value: "持续迭代", label: "把审核意见与业务结果带回下一轮" },
]

const capabilities: Array<[string, string]> = [
  ["定位与人设", "明确服务谁、解决什么问题，以及哪些话该说、哪些不能说。"],
  ["选题研究", "从客户问题、行业变化和企业案例中持续寻找内容切口。"],
  ["案例调用", "让观点有事实和故事支撑，避免内容只有正确的空话。"],
  ["文案与适配", "按照本人语气、视频结构和平台场景生成可拍摄版本。"],
  ["审核与质检", "检查事实、观点、尺度、AI 套话和商业承接是否合理。"],
  ["复盘与回流", "根据内容表现、线索质量和客户反馈继续优化资产。"],
]

const fit = [
  "业务和产品已经得到基本验证",
  "成交依赖老板或专家的专业信任",
  "希望小团队稳定生产内容并沉淀能力",
  "愿意提供真实资料并参与关键审核",
]

export default function IpAgentPage() {
  return (
    <main>
      <section className="border-b border-[#E8DED1] px-0 py-16 sm:py-20 lg:py-28">
        <div className="marketing-wrap grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-end">
          <div>
            <p className="marketing-section-label">{MARKETING_PRODUCT_NAME} · IP AGENT</p>
            <h1 className="marketing-hero-title mt-5 text-[#25211D]">
              把老板的经验，变成团队
              <em className="block">持续获得客户的能力</em>
            </h1>
            <p className="mt-7 max-w-3xl text-base leading-8 text-[#5F5A52] sm:text-lg">
              IP 智能体不只是写一段文案。它学习定位、观点、案例、表达习惯和业务规则，进入选题、生产、审核与复盘，让已经验证过的方法被稳定放大。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <WechatCtaButton className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-6 text-sm font-semibold text-white hover:bg-[#B83F2B]">
                预约企业诊断 <ArrowRight className="ml-2 h-4 w-4" />
              </WechatCtaButton>
              <Link href="/cases" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[#D8CABA] bg-white px-6 text-sm font-semibold text-[#25211D]">
                查看真实案例
              </Link>
            </div>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-[#E3D8C9] bg-[#E3D8C9] sm:grid-cols-3 lg:grid-cols-1">
            {outcomes.map((item) => (
              <div key={item.value} className="bg-[#FFFCF6] p-6">
                <p className="marketing-serif text-2xl font-bold text-[#D14A33]">{item.value}</p>
                <p className="mt-2 text-xs leading-6 text-[#6F675E]">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <AgentDemoSection />

      <HowItWorksSection />

      <CoreCapabilitiesSection capabilities={capabilities} />

      <WhoItIsForSection fit={fit} />

      <section className="px-0 py-16 sm:py-20">
        <div className="marketing-wrap flex flex-col justify-between gap-8 rounded-2xl bg-[#F3EADF] p-8 sm:p-10 lg:flex-row lg:items-center">
          <div>
            <p className="marketing-section-label">START WITH ONE IP</p>
            <h2 className="marketing-h-section mt-3 text-[#25211D]">先用一个真实选题，验证方法能不能被 AI 正确调用</h2>
          </div>
          <WechatCtaButton className="inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center bg-[#D14A33] px-6 text-sm font-semibold text-white hover:bg-[#B83F2B]">
            预约企业诊断
          </WechatCtaButton>
        </div>
      </section>
    </main>
  )
}

function HowItWorksSection() {
  return (
    <section className="bg-[#211D19] px-0 py-16 text-[#FFF9EF] sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
          <div>
            <p className="marketing-section-label text-[#D8AA51]">HOW IT WORKS</p>
            <h2 className="marketing-h-section mt-4">不是一次生成，而是一条可审核、可复盘的工作链路</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-white/55 lg:justify-self-end">
            企业资料和方法进入资产库后，每次任务都会经过规则调用、内容生成、人工审核与结果回流。AI 负责高频准备和重复执行，人保留最终判断。
          </p>
        </div>
        <ol className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 md:grid-cols-2 lg:grid-cols-5">
          {["资料与方法", "选题研究", "文案生产", "人工审核", "结果回流"].map((label, index) => (
            <li key={label} className="bg-[#211D19] p-6">
              <span className="font-mono text-xs text-[#E75B43]">0{index + 1}</span>
              <p className="mt-8 font-semibold">{label}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CoreCapabilitiesSection({ capabilities }: { capabilities: ReadonlyArray<[string, string]> }) {
  return (
    <section className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="max-w-3xl">
          <p className="marketing-section-label">CORE CAPABILITIES</p>
          <h2 className="marketing-h-section mt-4 text-[#25211D]">围绕一个 IP 的完整内容获客能力</h2>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-[#E8DED1] bg-[#E8DED1] md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map(([title, desc], index) => (
            <article key={title} className="bg-[#FFFCF6] p-6 sm:p-7">
              <span className="font-mono text-xs text-[#B88C33]">0{index + 1}</span>
              <h3 className="mt-6 text-lg font-semibold text-[#25211D]">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#6F675E]">{desc}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function WhoItIsForSection({ fit }: { fit: ReadonlyArray<string> }) {
  return (
    <section className="border-y border-[#E8DED1] bg-white/60 px-0 py-16 sm:py-20">
      <div className="marketing-wrap grid gap-8 lg:grid-cols-[0.75fr_1.25fr]">
        <div>
          <p className="marketing-section-label">WHO IT IS FOR</p>
          <h2 className="marketing-h-section mt-4 text-[#25211D]">更适合已经有真业务的老板和专业团队</h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {fit.map((item) => (
            <li key={item} className="flex min-h-20 gap-3 rounded-xl border border-[#E8DED1] bg-[#FFFCF6] p-5 text-sm leading-6 text-[#5F5A52]">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D14A33]" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function AgentDemoSection() {
  return (
    <section className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-end">
          <div>
            <p className="marketing-section-label">VISIBLE METHOD · 演示示例</p>
            <h2 className="marketing-h-section mt-4 text-[#25211D]">客户能看见：哪一条方法，影响了哪一句文案</h2>
          </div>
          <p className="max-w-2xl text-sm leading-7 text-[#6F675E] lg:justify-self-end">
            以下为合理假设的演示场景，不包含虚构业绩数据。客户希望面向企业老板发布一条“为什么专业老板做不好 IP”的观点视频。
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-[0.72fr_1.28fr]">
          <article className="rounded-2xl border border-[#E8DED1] bg-[#F3EADF] p-6 sm:p-8">
            <p className="text-xs font-semibold tracking-[0.16em] text-[#B88C33]">客户输入</p>
            <dl className="mt-6 space-y-5 text-sm">
              <div><dt className="font-semibold text-[#25211D]">目标人群</dt><dd className="mt-1 leading-6 text-[#6F675E]">有成熟业务、想做创始人 IP 的企业老板</dd></div>
              <div><dt className="font-semibold text-[#25211D]">核心观点</dt><dd className="mt-1 leading-6 text-[#6F675E]">老板缺的不是选题，而是内容与业务脱节</dd></div>
              <div><dt className="font-semibold text-[#25211D]">发布场景</dt><dd className="mt-1 leading-6 text-[#6F675E]">60—90 秒视频号观点视频</dd></div>
              <div><dt className="font-semibold text-[#25211D]">表达要求</dt><dd className="mt-1 leading-6 text-[#6F675E]">直接、克制、有商业判断，不贩卖焦虑</dd></div>
            </dl>
          </article>

          <article className="overflow-hidden rounded-2xl border border-[#E8DED1] bg-white">
            <div className="border-b border-[#E8DED1] bg-[#211D19] px-6 py-4 text-xs font-semibold tracking-[0.16em] text-[#D8AA51]">智能体输出 · 可拍摄文案</div>
            <div className="space-y-5 p-6 text-sm leading-7 text-[#4F4942] sm:p-8">
              <AnnotatedCopy label="反常识钩子">很多专业老板做不好 IP，不是因为他没有内容，恰恰是因为他脑子里的内容太多。</AnnotatedCopy>
              <AnnotatedCopy label="问题重构">他今天讲行业，明天讲管理，后天又追一个热点，每句话都对，但客户始终不知道：你到底能帮我解决什么问题。</AnnotatedCopy>
              <AnnotatedCopy label="核心观点">顶级 IP 不是持续曝光自己，而是持续占领目标客户心里一个清晰的业务位置。</AnnotatedCopy>
              <AnnotatedCopy label="业务承接">所以第一步不是追热点，而是把你的客户、产品、案例和判断整理成一套内容标准，再让团队和 AI 围绕同一个方向持续生产。</AnnotatedCopy>
              <AnnotatedCopy label="行动引导">如果你的业务已经成熟，但内容始终和成交脱节，可以先做一次 IP 内容获客诊断。</AnnotatedCopy>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

function AnnotatedCopy({ label, children }: { label: string; children: string }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[92px_1fr]">
      <span className="text-xs font-semibold text-[#D14A33]">{label}</span>
      <p>{children}</p>
    </div>
  )
}
