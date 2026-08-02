"use client"

import { MarketingSectionHeader } from "./section-header"

const rows = [
  {
    other: "通用 AI 工具",
    ours: "围绕商业目标与企业经验组织调用，而不是只给一个对话框",
  },
  {
    other: "培训机构",
    ours: "不只讲课，还把方法装进真实工作流程与可迭代资产",
  },
  {
    other: "软件开发公司",
    ours: "先对齐业务闭环，再实施系统，避免只交付一套空壳工具",
  },
  {
    other: "传统代运营",
    ours: "目标是沉淀企业自有智能体资产，而不是长期外包内容产能",
  },
]

/**
 * @description Differentiation comparison table.
 */
export function DifferentiatorsSection() {
  return (
    <section id="difference" className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <MarketingSectionHeader
          label="差异化"
          title="同时处理目标、经验、流程与项目交付"
          description="明动远见不是单点卖工具、卖课或卖外包，而是共建企业专有智能体资产。"
        />
        <div className="overflow-hidden rounded-2xl border border-[#E8DED1] bg-[#FEFDFB]">
          <div className="hidden grid-cols-[200px_1fr] border-b border-[#EFE7DC] bg-[#F6EEDA]/60 md:grid">
            <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#8A8175]">
              常见选择
            </div>
            <div className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#8A8175]">
              明动远见怎么做
            </div>
          </div>
          {rows.map((row) => (
            <div
              key={row.other}
              className="grid grid-cols-1 gap-2 border-t border-[#EFE7DC] px-5 py-5 first:border-t-0 md:grid-cols-[200px_1fr] md:gap-6"
            >
              <div className="text-sm font-semibold text-[#D14A33]">{row.other}</div>
              <div className="text-sm leading-relaxed text-[#5F5A52]">{row.ours}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
