import Image from "next/image"

const metrics = [
  { value: "904.46 万", label: "单条视频播放" },
  { value: "31.50 万", label: "点赞" },
  { value: "18.28 万", label: "收藏" },
  { value: "6.79 万", label: "分享" },
  { value: "776 单", label: "近 30 天成交" },
]

const evidence = [
  {
    src: "/marketing/internal-practice/content-performance-redacted.png",
    alt: "明动远见内部实践单条视频内容数据后台",
    eyebrow: "内容触达",
    title: "一条内容，不只看播放量",
    description:
      "单条视频播放 904.46 万、点赞 31.50 万、收藏 18.28 万、分享 6.79 万，并带来 2 万新增粉丝。",
  },
  {
    src: "/marketing/internal-practice/product-funnel.png",
    alt: "明动远见内部实践视频号商品数据后台",
    eyebrow: "商品承接",
    title: "从内容进入商品点击与下单",
    description:
      "近 30 天商品曝光 37.12 万次、点击 6967 次、下单 759 次，证明内容之后存在真实承接链路。",
  },
  {
    src: "/marketing/internal-practice/transaction-performance.png",
    alt: "明动远见内部实践视频号成交数据后台",
    eyebrow: "成交结果",
    title: "成交结果可以继续复盘",
    description:
      "统计期内成交订单 776 笔，成交金额约 1.54 万元。金额不是重点，重点是内容、商品与成交数据能够连起来。",
  },
]

/**
 * @description First-party evidence from Mingdong Vision's internal AIM practice.
 */
export function InternalPracticeEvidence() {
  return (
    <section id="internal-practice-evidence" className="bg-[#211D19] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold tracking-[0.22em] text-[#D8AA51]">
              明远 AIM · 内部实战证据
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight text-[#FFF9EF] sm:text-4xl">
              从内容触达到成交，
              <br className="hidden sm:block" />
              每一步都有后台数据
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-8 text-[#C7BDB0] lg:justify-self-end">
            这不是演示账号，也不是只展示一条漂亮文案。我们用自己的业务验证选题、内容、互动、
            商品承接与成交复盘，让智能体真正进入日常运营。
          </p>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="bg-[#2A2520] px-5 py-6">
              <p className="text-2xl font-semibold tracking-tight text-[#FFF9EF]">
                {metric.value}
              </p>
              <p className="mt-2 text-xs tracking-wide text-[#AFA397]">{metric.label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {evidence.map((item, index) => (
            <article
              key={item.src}
              className={`overflow-hidden rounded-2xl border border-white/10 bg-[#F7F2E9] ${
                index === 0 ? "lg:col-span-2" : ""
              }`}
            >
              <div className={`relative bg-white ${index === 0 ? "aspect-[16/9]" : "aspect-[1.44/1]"}`}>
                <Image
                  src={item.src}
                  alt={item.alt}
                  fill
                  loading="eager"
                  sizes={index === 0 ? "(min-width: 1024px) 1280px, 100vw" : "(min-width: 1024px) 630px, 100vw"}
                  className="object-contain"
                />
              </div>
              <div className="border-t border-[#E3D8C9] p-6 sm:p-7">
                <p className="text-xs font-semibold tracking-[0.18em] text-[#B88C33]">
                  {item.eyebrow}
                </p>
                <h3 className="mt-2 text-xl font-bold text-[#25211D]">{item.title}</h3>
                <p className="mt-3 text-sm leading-7 text-[#655D54]">{item.description}</p>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-6 text-xs leading-6 text-[#958A7E]">
          数据来自明动远见拥有发布权的账号后台。不同截图的统计页面、时间范围与刷新时间不同，
          均保留平台原始口径；无关工作信息已遮挡。以上用于证明内部实践链路，
          不构成对客户项目播放量、订单量或成交额的承诺。
        </p>
      </div>
    </section>
  )
}
