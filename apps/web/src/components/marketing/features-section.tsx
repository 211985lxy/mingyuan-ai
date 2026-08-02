import Link from "next/link"
import { MARKETING_PRODUCT_NAME } from "@/lib/marketing-brand"

const items = [
  { index: "01", title: "学习老板", desc: "沉淀定位、观点、案例、表达习惯与业务边界。" },
  { index: "02", title: "持续做内容", desc: "覆盖选题研究、脚本生产、多版本适配和人工审核。" },
  { index: "03", title: "进入真实运营", desc: "让内容、矩阵协同、客户承接和复盘处在同一条链路。" },
  { index: "04", title: "按结果优化", desc: "用线索质量、客户反馈与内容表现反哺下一轮生产。" },
]

export function FeaturesSection() {
  return (
    <section className="bg-[#211D19] px-0 py-16 text-[#FFF9EF] sm:py-20 lg:py-24">
      <div className="marketing-wrap grid gap-10 lg:grid-cols-[0.78fr_1.22fr]">
        <div>
          <p className="marketing-section-label text-[#D8AA51]">核心产品 · {MARKETING_PRODUCT_NAME}</p>
          <h2 className="marketing-h-section mt-4">把一个人的专业判断，变成团队持续使用的系统</h2>
          <p className="mt-5 text-sm leading-7 text-white/55">它不是随机生成文案，而是在企业资料、IP 方法、运营规则与人工审核的共同约束下完成内容生产。</p>
          <Link href="/ip-agent" className="mt-7 inline-flex text-sm font-semibold text-[#E75B43] hover:underline">查看 IP 智能体如何工作 →</Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
          {items.map((it) => (
            <div key={it.title} className="grid gap-3 border-t border-white/10 p-6 first:border-t-0 sm:grid-cols-[46px_160px_1fr] sm:items-start">
              <span className="font-mono text-xs text-[#E75B43]">{it.index}</span>
              <h3 className="font-semibold">{it.title}</h3>
              <p className="text-sm leading-6 text-white/50">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
