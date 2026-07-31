import { MARKETING_PRODUCT_NAME } from "@/lib/marketing-brand"

const items = [
  { title: "学习老板", desc: "沉淀定位、表达、判断，让输出更像本人。" },
  { title: "持续做内容", desc: "选题、脚本、矩阵协同，降低中断风险。" },
  { title: "按结果优化", desc: "用线索质量与内容表现反哺选题。" },
]

export function FeaturesSection() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-12">
      <h2 className="text-sm font-medium text-[#D14A33]">{MARKETING_PRODUCT_NAME}</h2>
      <div className="mt-6 divide-y divide-[#E8DED1] border-y border-[#E8DED1]">
        {items.map((it) => (
          <div key={it.title} className="py-4">
            <h3 className="text-sm font-semibold text-[#25211D]">{it.title}</h3>
            <p className="mt-1 text-sm text-[#8A8175]">{it.desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
