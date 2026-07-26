import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_PRIMARY_CTA,
  MARKETING_PRODUCT_NAME,
  MARKETING_SITE_ORIGIN,
} from "@/lib/marketing-brand"
import { WechatCtaButton } from "@/components/marketing/wechat-cta"

export const metadata: Metadata = {
  title: `客户案例｜${MARKETING_COMPANY_NAME}`,
  description: `匿名展示金融资产领域创始人 IP 项目与 ${MARKETING_PRODUCT_NAME} 内部实践。外部案例不出现客户名称、账号与可识别信息；数据由项目方提供。`,
  alternates: {
    canonical: `${MARKETING_SITE_ORIGIN}/cases`,
  },
}

/**
 * @description Cases page — anonymous external case + internal AIM practice.
 */
export default function CasesPage() {
  return (
    <main className="flex flex-col">
      <section className="bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 text-sm font-semibold text-[#B88C33]">客户案例</p>
          <h1 className="text-3xl font-bold leading-tight text-[#25211D] sm:text-5xl">
            用真实业务结果说话，同时保护客户身份
          </h1>
          <p className="mt-6 text-base leading-8 text-[#5F5A52] sm:text-lg">
            首发两个案例：外部项目全程行业级匿名；内部实践仅使用
            {MARKETING_COMPANY_NAME} 拥有发布权的素材与数据。
          </p>
        </div>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <article className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-[#25211D] sm:text-3xl">
            某金融资产领域创始人 IP 项目
          </h2>
          <p className="mt-3 text-sm text-[#8A8175]">
            全程匿名。不展示客户名称、IP 名称、账号名称、头像、企业名称及可反向识别截图。
          </p>

          <div className="mt-10 space-y-8">
            <CaseBlock title="业务背景">
              项目面向金融资产领域的创始人个人 IP
              与账号矩阵运营，核心目标是持续获取精准线索并支撑商业转化。
            </CaseBlock>
            <CaseBlock title="原有问题">
              内容生产高度依赖核心操盘人手；矩阵账号协同成本高；经验难沉淀，团队难以稳定复制高质量输出。
            </CaseBlock>
            <CaseBlock title="核心操盘能力">
              项目方已具备成熟的内容操盘、线索筛选与转化组织能力。这是业务结果的基础，不是 AI
              单独创造的。
            </CaseBlock>
            <CaseBlock title="AI 如何参与">
              AI
              用于提升内容生产效率、选题结构化与矩阵协同效率，让核心操盘能力覆盖更多账号与节奏，而不是替代业务判断。
            </CaseBlock>
            <CaseBlock title="工作流程">
              经验与案例输入 → 选题与脚本生产 → 人工审核发布 → 矩阵协同 →
              线索与转化复盘回流。
            </CaseBlock>
            <CaseBlock title="业务结果">
              <ul className="list-disc space-y-2 pl-5">
                <li>单月精准线索 4000+</li>
                <li>每月商业转化数百万元</li>
                <li>账号矩阵 20+</li>
              </ul>
              <p className="mt-3 text-xs text-[#8A8175]">
                数据由项目方提供。不暗示全部业务成果由 AI 单独创造。
              </p>
            </CaseBlock>
            <CaseBlock title="沉淀资产">
              可复用的选题方法、表达资产、审核标准与矩阵协同节奏，降低对单一人手的依赖。
            </CaseBlock>
          </div>
        </article>
      </section>

      <section className="bg-[#FAF8F3] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <article className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold text-[#25211D] sm:text-3xl">
            {MARKETING_PRODUCT_NAME} 内部实践
          </h2>
          <p className="mt-3 text-sm text-[#8A8175]">
            仅使用 {MARKETING_COMPANY_NAME} 拥有发布权的界面、账号截图与素材。
          </p>

          <div className="mt-10 space-y-8">
            <CaseBlock title="流程">
              商业诊断 → IP 定位 → 内容研究 → 脚本生产 → 运营复盘，完整跑通
              {MARKETING_PRODUCT_NAME} 工作台闭环。
            </CaseBlock>
            <CaseBlock title="结果">
              <ul className="list-disc space-y-2 pl-5">
                <li>抖音 AI 内容账号粉丝 2.4 万</li>
                <li>单条视频播放近千万</li>
              </ul>
            </CaseBlock>
            <CaseBlock title="意义">
              验证「经验进入工作 → 结果回流优化」可以在真实内容业务中运转，而不是停留在演示。
            </CaseBlock>
          </div>
        </article>
      </section>

      <section className="bg-white px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-bold text-[#25211D]">
            想验证自己的业务是否适合？
          </h2>
          <div className="mt-2 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <WechatCtaButton className="jade-emboss inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-8 py-3 text-sm font-semibold text-white hover:bg-[#B83F2B]">
              {MARKETING_PRIMARY_CTA}
              <ArrowRight className="ml-2 h-4 w-4" />
            </WechatCtaButton>
            <Link
              href="/ip-agent"
              className="inline-flex items-center justify-center rounded-lg border border-[#D14A33]/25 bg-[#FAF8F3] px-8 py-3 text-sm font-semibold text-[#25211D] hover:bg-[#FFF8F4]"
            >
              了解 IP 智能体
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

function CaseBlock({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-[#25211D]">{title}</h3>
      <div className="text-sm leading-relaxed text-[#5F5A52]">{children}</div>
    </div>
  )
}
