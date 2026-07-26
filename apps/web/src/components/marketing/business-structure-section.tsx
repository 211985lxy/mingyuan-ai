"use client"

import Link from "next/link"
import { MARKETING_PRODUCT_NAME } from "@/lib/marketing-brand"
import { MarketingSectionHeader } from "./section-header"

const offerings = [
  {
    code: "01",
    tag: "CONTENT",
    title: "内容获客 AI",
    desc: "把老板经验转成可持续的选题、文案与矩阵协同。",
    metrics: [
      { value: "当前核心", label: "优先交付" },
      { value: "IP 智能体", label: "能力闭环" },
    ],
    highlight: true,
    href: "/ip-agent",
  },
  {
    code: "02",
    tag: "METHOD",
    title: "专业方法 AI",
    desc: "把咨询、诊断、交付方法沉淀为可调用能力，降低专家依赖。",
    metrics: [
      { value: "方法资产", label: "可复用" },
      { value: "专家协同", label: "审核边界" },
    ],
    highlight: false,
  },
  {
    code: "03",
    tag: "KNOWLEDGE",
    title: "企业知识与交付 AI",
    desc: "整理知识库、案例库与交付模板，让专业服务可复制。",
    metrics: [
      { value: "知识库", label: "结构化" },
      { value: "交付模板", label: "可迭代" },
    ],
    highlight: false,
  },
  {
    code: "04",
    tag: "TEAM",
    title: "团队 AI 能力共建",
    desc: "陪跑团队建立提示、审核、复盘与责任边界，避免只会买工具。",
    metrics: [
      { value: "陪跑", label: "真实流程" },
      { value: "责任边界", label: "可落地" },
    ],
    highlight: false,
  },
]

/**
 * @description Numbered solution cards with metric chips.
 */
export function BusinessStructureSection() {
  return (
    <section id="business" className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <MarketingSectionHeader
          label="业务结构"
          title="已经在跑、按结果共建的能力"
          description={`当前优先交付内容获客 AI；核心产品 ${MARKETING_PRODUCT_NAME} 承接经验调用与内容生产。`}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {offerings.map((item) => (
            <article
              key={item.code}
              className={`marketing-solution-card ${item.highlight ? "is-core" : ""}`}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="font-mono text-xs tracking-wider text-[#B88C33]">
                  № {item.code} · {item.tag}
                </span>
                {item.highlight ? (
                  <span className="rounded-full bg-[#D14A33] px-2.5 py-0.5 text-[11px] font-medium text-white">
                    当前核心
                  </span>
                ) : null}
              </div>
              <h3 className="marketing-serif text-xl font-bold text-[#25211D]">
                {item.title}
              </h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[#6F675E]">
                {item.desc}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {item.metrics.map((m) => (
                  <span key={m.label} className="marketing-metric">
                    <strong>{m.value}</strong>
                    {m.label}
                  </span>
                ))}
              </div>
              {item.href ? (
                <Link
                  href={item.href}
                  className="mt-5 inline-flex text-sm font-semibold text-[#D14A33] hover:underline"
                >
                  查看 IP 智能体能力 →
                </Link>
              ) : null}
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
