"use client"

import { MarketingSectionHeader } from "./section-header"

const path = [
  "找准问题",
  "整理经验",
  "AI 学会",
  "进入真实工作",
  "根据结果优化",
]

/**
 * @description Cooperation path rail.
 */
export function CooperationPathSection() {
  return (
    <section id="path" className="bg-white/60 px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <MarketingSectionHeader
          label="合作路径"
          title="从诊断开始，装进流程，再按结果迭代"
          description="不追求一次交付万能系统，先跑通最小验证单元。"
        />
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {path.map((label, index) => (
            <li key={label} className="marketing-solution-card text-center">
              <span className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#D14A33] text-sm font-bold text-white">
                {index + 1}
              </span>
              <p className="text-sm font-semibold text-[#25211D]">{label}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
