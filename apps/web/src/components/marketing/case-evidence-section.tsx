"use client"

import Link from "next/link"
import { MarketingSectionHeader } from "./section-header"

const teasers = [
  {
    code: "CASE · 01",
    title: "企业现金流与财商顾问 IP 项目",
    metrics: [
      { value: "4000+", label: "单月精准线索" },
      { value: "数百万元", label: "月商业转化" },
      { value: "20+", label: "账号矩阵" },
    ],
    notes: [
      "专业操盘决定方向，IP 智能体提升研究、文案与矩阵协同效率",
      "内容触达、客户线索与商业承接处在同一条业务链路",
    ],
  },
  {
    code: "CASE · 02",
    title: "明远 AIM 内部实践",
    metrics: [
      { value: "904.46 万", label: "单条播放" },
      { value: "31.50 万", label: "点赞" },
      { value: "776 笔", label: "统计期成交" },
    ],
    notes: [
      "覆盖商业诊断、IP 定位、内容研究、脚本生产与运营复盘",
      "仅使用明动远见拥有发布权的素材",
    ],
  },
]

/**
 * @description Case evidence as metric-forward studio cards.
 */
export function CaseEvidenceSection() {
  return (
    <section id="cases" className="bg-white/60 px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <MarketingSectionHeader
          label="案例证据"
          title="真实业务里怎么用"
          description="不只展示做了多少内容，更展示内容如何连接目标客户与真实业务结果。"
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {teasers.map((item) => (
            <article key={item.code} className="marketing-solution-card">
              <p className="mb-3 font-mono text-xs tracking-wider text-[#B88C33]">
                {item.code}
              </p>
              <h3 className="marketing-serif text-xl font-bold text-[#25211D]">
                {item.title}
              </h3>
              <div className="mt-5 flex flex-wrap gap-2">
                {item.metrics.map((m) => (
                  <span key={m.label} className="marketing-metric">
                    <strong>{m.value}</strong>
                    {m.label}
                  </span>
                ))}
              </div>
              <ul className="mt-5 space-y-2">
                {item.notes.map((note) => (
                  <li
                    key={note}
                    className="flex gap-2 text-sm leading-relaxed text-[#6F675E]"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[#D14A33]" />
                    {note}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <div className="mt-8">
          <Link
            href="/cases"
            className="inline-flex text-sm font-semibold text-[#D14A33] hover:underline"
          >
            查看完整案例 →
          </Link>
        </div>
      </div>
    </section>
  )
}
