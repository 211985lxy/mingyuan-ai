"use client"

import {
  Brain,
  ClipboardList,
  RefreshCcw,
  UserRound,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { MarketingSectionHeader } from "./section-header"

const problems: { title: string; desc: string; Icon: LucideIcon }[] = [
  {
    title: "经验依赖老板",
    desc: "判断、表达和成交方法在老板脑子里，团队难以稳定复制。",
    Icon: UserRound,
  },
  {
    title: "内容容易中断",
    desc: "缺人、缺素材、缺节奏时，获客内容生产就会停摆。",
    Icon: ClipboardList,
  },
  {
    title: "专业交付难复制",
    desc: "方法论和案例散落各处，新人上手慢，交付质量波动大。",
    Icon: Brain,
  },
  {
    title: "AI 未进入工作流程",
    desc: "工具很多，但没有进入选题、生产、审核和复盘的真实链路。",
    Icon: RefreshCcw,
  },
]

/**
 * @description Enterprise problem grid.
 */
export function PainPointsSection() {
  return (
    <section id="problems" className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <MarketingSectionHeader
          label="企业问题"
          title="真正卡住的，不是缺一个 AI 工具"
          description="而是经验、内容、交付和流程没有形成可调用、可迭代的资产。"
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {problems.map(({ title, desc, Icon }, index) => (
            <div key={title} className="marketing-solution-card">
              <div className="mb-5 flex items-center justify-between">
                <div className="seal-icon h-10 w-10">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="font-mono text-xs text-[#B88C33]">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mb-2 text-base font-semibold text-[#25211D]">
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-[#6F675E]">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
