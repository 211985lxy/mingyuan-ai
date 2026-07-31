import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Check, X } from "lucide-react"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_PRIMARY_CTA,
  MARKETING_PRODUCT_NAME,
  MARKETING_SITE_ORIGIN,
} from "@/lib/marketing-brand"
import { WechatCtaButton } from "@/components/marketing/wechat-cta"

export const metadata: Metadata = {
  title: `IP 智能体｜${MARKETING_COMPANY_NAME}`,
  description: `IP 智能体不是通用聊天机器人或单纯文案生成器。它覆盖定位、选题、案例调用、表达适配、质量审核与结果复盘，并与 ${MARKETING_PRODUCT_NAME} 工作流闭环。`,
  alternates: {
    canonical: `${MARKETING_SITE_ORIGIN}/ip-agent`,
  },
}

const capabilities = [
  { title: "IP 定位", desc: "把业务目标、人群与差异化主张整理成可调用的人设资产。" },
  { title: "选题研究", desc: "结合客户问题、对标结构与业务节奏，持续产出可拍选题。" },
  { title: "案例调用", desc: "从企业真实案例中抽取证据与故事，支撑信任与转化。" },
  { title: "表达适配", desc: "按老板语气、场景与平台约束改写，避免千篇一律。" },
  { title: "质量审核", desc: "检查跑题、空泛、AI 套话与证据不足，专家可再审。" },
  { title: "结果复盘", desc: "把播放、线索与转化反馈回流，迭代选题与资产。" },
]

const loop = [
  { title: "企业资料输入", desc: "定位、经验、案例、话术与业务目标进入资产库。" },
  { title: "智能体处理", desc: "按任务调用资产，生成选题、文案与可执行交接。" },
  { title: "专家审核", desc: "关键输出由业务方或内容专家把关，保留责任边界。" },
  { title: "修改回流", desc: "确认有效的表达与方法沉淀回智能体，下次更准。" },
]

const fit = [
  "知识密集、强信任、高客单的专业服务企业",
  "老板愿意参与定位与审核，而不是完全甩手",
  "业务已有基本验证，需要放大内容与交付效率",
]

const unfit = [
  "业务尚未验证，只想用 AI 碰运气获客",
  "老板完全不参与，只要求外包产出",
  "只购买模板，或低预算要求大量定制开发",
]

/**
 * @description IP agent marketing page.
 */
export default function IpAgentPage() {
  return (
    <main className="flex flex-col">
      <section className="bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-semibold text-[#B88C33]">IP 智能体</p>
          <h1 className="text-3xl font-bold leading-tight text-[#25211D] sm:text-5xl">
            不是通用聊天机器人，也不是单纯文案生成器
          </h1>
          <p className="mt-6 text-base leading-8 text-[#5F5A52] sm:text-lg">
            IP 智能体帮助企业把老板经验、案例与表达习惯装进可调用能力，进入选题、生产、审核与复盘闭环。核心产品{" "}
            {MARKETING_PRODUCT_NAME} 承接日常工作。
          </p>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-10 text-center text-2xl font-bold text-[#25211D] sm:text-3xl">
            六项核心能力
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((item) => (
              <div
                key={item.title}
                className="rounded-xl border border-[#E8DED1] bg-[#FAF8F3] p-6"
              >
                <h3 className="mb-2 text-lg font-semibold text-[#25211D]">
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed text-[#6F675E]">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h2 className="mb-10 text-center text-2xl font-bold text-[#25211D] sm:text-3xl">
            完整闭环
          </h2>
          <ol className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            {loop.map((item, index) => (
              <li
                key={item.title}
                className="rounded-xl border border-[#E8DED1] bg-white p-6"
              >
                <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#D14A33] text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mb-2 font-semibold text-[#25211D]">{item.title}</h3>
                <p className="text-sm leading-relaxed text-[#6F675E]">{item.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
          <div className="rounded-xl border border-[#E8DED1] bg-[#FAF8F3] p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold text-[#25211D]">适合</h2>
            <ul className="space-y-3">
              {fit.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-[#5F5A52]">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#D14A33]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl border border-[#E8DED1] bg-[#FAF8F3] p-6 sm:p-8">
            <h2 className="mb-6 text-xl font-bold text-[#25211D]">不适合</h2>
            <ul className="space-y-3">
              {unfit.map((item) => (
                <li key={item} className="flex gap-2 text-sm text-[#5F5A52]">
                  <X className="mt-0.5 h-4 w-4 shrink-0 text-[#8A8175]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-bold text-[#25211D]">下一步</h2>
          <p className="text-[#5F5A52]">
            添加微信预约诊断，或登录 {MARKETING_PRODUCT_NAME} 进入工作台。
          </p>
          <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <WechatCtaButton className="jade-emboss inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-8 py-3 text-sm font-semibold text-white hover:bg-[#B83F2B]">
              {MARKETING_PRIMARY_CTA}
              <ArrowRight className="ml-2 h-4 w-4" />
            </WechatCtaButton>
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-lg border border-[#D14A33]/25 bg-white px-8 py-3 text-sm font-semibold text-[#25211D] hover:bg-[#FFF8F4]"
            >
              登录智能体
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
