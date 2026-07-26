"use client"

import { MarketingSectionHeader } from "./section-header"

const steps = [
  {
    title: "老板经验",
    desc: "整理判断、案例、表达习惯和业务目标。",
  },
  {
    title: "AI 学会",
    desc: "把经验变成可调用的智能体能力与内容资产。",
  },
  {
    title: "进入工作",
    desc: "嵌入选题、生产、审核、交付等真实流程。",
  },
  {
    title: "结果回流",
    desc: "用线索、转化与复盘数据继续迭代资产。",
  },
]

/**
 * @description Core method steps — numbered editorial rail.
 */
export function HowItWorksSection() {
  return (
    <section id="method" className="bg-white/60 px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <MarketingSectionHeader
          label="核心方法"
          title="让经验进入工作，再按结果优化"
          description="不是一次生成一篇文案，而是把老板经验沉淀成可持续调用的智能体资产。"
        />
        <ol className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, index) => (
            <li key={step.title} className="marketing-solution-card relative">
              <span className="marketing-serif mb-4 block text-4xl font-bold text-[#D14A33]/25">
                {index + 1}
              </span>
              <h3 className="mb-2 text-lg font-semibold text-[#25211D]">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-[#6F675E]">{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
