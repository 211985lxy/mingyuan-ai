"use client"

import Link from "next/link"
import { BrandLogo } from "@/components/branding/brand-logo"
import {
  MARKETING_COMPANY_NAME,
  MARKETING_PRODUCT_NAME,
} from "@/lib/marketing-brand"

/**
 * 认证页布局：走语义 token（随明暗主题联动），不硬编码品牌色。
 * 硬编码浅色会导致暗色下「外层浅、卡片深」的割裂渲染。
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen items-start justify-center overflow-x-hidden bg-background px-4 pt-[12vh] sm:items-center sm:px-6 sm:pt-0">
      <div
        className="mx-auto min-w-0 [&>[data-slot=card]]:w-full"
        style={{ width: "100%", maxWidth: "min(28rem, calc(100vw - 2rem))" }}
      >
        <div className="mb-6 flex min-w-0 flex-col items-center justify-center gap-2 text-center">
          <Link
            href="/"
            className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <BrandLogo className="h-10 w-10" />
            <span className="text-2xl font-bold leading-tight text-foreground">
              {MARKETING_COMPANY_NAME}
            </span>
          </Link>
          <p className="text-sm text-muted-foreground">
            核心产品 {MARKETING_PRODUCT_NAME} · 企业专有智能体工作台
          </p>
        </div>
        {children}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link
            href="/"
            className="text-primary underline-offset-4 hover:underline"
          >
            返回官网
          </Link>
          <span className="mx-2 text-border">·</span>
          <Link
            href="/ip-agent"
            className="underline-offset-4 hover:text-primary hover:underline"
          >
            了解 IP 智能体
          </Link>
        </p>
      </div>
    </div>
  )
}
