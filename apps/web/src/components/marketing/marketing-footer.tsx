"use client"

import Link from "next/link"
import { BrandLogo } from "@/components/branding/brand-logo"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_LEGAL_ENTITY,
  MARKETING_PRIMARY_CTA,
  MARKETING_PRODUCT_NAME,
} from "@/lib/marketing-brand"
import { WechatCtaButton } from "./wechat-cta"

const footerColumns = [
  {
    heading: "了解",
    links: [
      { label: "首页", href: "/" },
      { label: "IP 智能体", href: "/ip-agent" },
      { label: "客户案例", href: "/cases" },
      { label: "关于我们", href: "/about" },
    ],
  },
  {
    heading: "产品与登录",
    links: [
      { label: `登录 ${MARKETING_PRODUCT_NAME}`, href: "/login" },
      { label: "注册账号", href: "/register" },
    ],
  },
]

/**
 * @description Marketing footer with legal entity and brand hierarchy.
 */
export function MarketingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/5 bg-[#25211D]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-3 flex items-center gap-2.5">
              <BrandLogo className="h-7 w-7" />
              <span className="text-xl font-bold text-white">
                {MARKETING_COMPANY_NAME}
              </span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-white/55">
              企业专有智能体资产共建。核心产品 {MARKETING_PRODUCT_NAME}。
            </p>
            <WechatCtaButton className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#D14A33] px-4 py-2 text-sm font-medium text-white transition-colors duration-200 hover:bg-[#B83F2B]">
              {MARKETING_PRIMARY_CTA}
            </WechatCtaButton>
          </div>

          {footerColumns.map(({ heading, links }) => (
            <div key={heading}>
              <h3 className="mb-4 text-sm font-semibold text-white">{heading}</h3>
              <ul className="space-y-2.5">
                {links.map(({ label, href }) => (
                  <li key={href + label}>
                    <Link
                      href={href}
                      className="text-sm text-white/55 transition-colors duration-200 hover:text-white"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <h3 className="mb-4 text-sm font-semibold text-white">法律主体</h3>
            <p className="text-sm leading-relaxed text-white/55">
              {MARKETING_LEGAL_ENTITY}
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-white/5 pt-8">
          <p className="text-center text-sm text-white/35">
            © {year} {MARKETING_COMPANY_NAME} · {MARKETING_LEGAL_ENTITY}
          </p>
        </div>
      </div>
    </footer>
  )
}
