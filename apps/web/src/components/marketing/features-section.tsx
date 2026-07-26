"use client"

import Link from "next/link"
import { MARKETING_PRODUCT_NAME } from "@/lib/marketing-brand"

const capabilities = [
  {
    index: "①",
    title: "学习老板",
    desc: "沉淀定位、表达、案例与判断，让输出更像本人、更贴业务。",
  },
  {
    index: "②",
    title: "持续做内容",
    desc: "覆盖选题研究、脚本生产、矩阵协同，降低内容中断风险。",
  },
  {
    index: "③",
    title: "支持稳定运营",
    desc: "把审核、复盘和资产回流嵌进日常工作，而不是一次性生成。",
  },
  {
    index: "④",
    title: "按真实结果优化",
    desc: "用线索质量、转化与内容表现反哺提示词、选题与素材库。",
  },
]

/**
 * @description Product spotlight — distill-style featured block.
 */
export function FeaturesSection() {
  return (
    <section id="product" className="px-0 py-16 sm:py-20 lg:py-24">
      <div className="marketing-wrap">
        <div className="overflow-hidden rounded-2xl border border-[#E8DED1] bg-[#25211D] text-[#F5F3EF]">
          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="p-8 sm:p-10 lg:p-12">
              <p className="marketing-section-label mb-3 text-[#B88C33]">
                ★ 核心产品
              </p>
              <h2 className="marketing-serif text-3xl font-bold leading-tight sm:text-4xl">
                {MARKETING_PRODUCT_NAME}
                <span className="mt-2 block text-lg font-medium text-white/55 sm:text-xl">
                  Mingyuan AIM · Enterprise Agent Workspace
                </span>
              </h2>
              <p className="mt-5 max-w-xl text-base leading-8 text-white/70">
                把好老板的判断变成组织可调用资产：学习老板、持续做内容、支持稳定运营，并根据真实结果优化。
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  href="/ip-agent"
                  className="inline-flex text-sm font-semibold text-[#B88C33] hover:underline"
                >
                  了解 IP 智能体 →
                </Link>
                <Link
                  href="/login"
                  className="inline-flex text-sm font-semibold text-white/70 hover:text-white"
                >
                  登录工作台 →
                </Link>
              </div>
            </div>
            <div className="border-t border-white/10 bg-black/20 p-8 sm:p-10 lg:border-l lg:border-t-0 lg:p-12">
              <ol className="space-y-6">
                {capabilities.map((item) => (
                  <li key={item.title} className="flex gap-4">
                    <span className="marketing-serif text-xl text-[#B88C33]">
                      {item.index}
                    </span>
                    <div>
                      <h3 className="font-semibold text-white">{item.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-white/55">
                        {item.desc}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
