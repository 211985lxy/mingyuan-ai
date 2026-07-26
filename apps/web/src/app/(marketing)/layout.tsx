import { MarketingNavbar } from "@/components/marketing/marketing-navbar"
import { MarketingFooter } from "@/components/marketing/marketing-footer"
import { MarketingCtaProvider } from "@/components/marketing/wechat-cta"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="marketing-page flex min-h-screen flex-col" lang="zh-CN">
      <div className="marketing-atmosphere" aria-hidden />
      <MarketingCtaProvider>
        <MarketingNavbar />
        <div className="relative z-[1] flex-1">{children}</div>
        <MarketingFooter />
      </MarketingCtaProvider>
    </div>
  )
}
