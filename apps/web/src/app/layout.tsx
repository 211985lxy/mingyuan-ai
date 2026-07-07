import type { Metadata, Viewport } from "next"
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"
import { BrandingProvider } from "@/components/providers/branding-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import { getBrandingConfig } from "@/lib/branding"
import "./globals.css"

// 所有页面都依赖 DB(getBrandingConfig)与请求上下文(getMessages),
// 不做静态预渲染。否则 next build 在 prerender 阶段会因
// workUnitAsyncStorage InvariantError 退出码 1,导致 docker build 失败。
export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBrandingConfig()

  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
    title: `${branding.name} - AI内容总监`,
    description: `${branding.name}，帮企业把业务资料、老板经验、项目案例变成可持续生产的内容资产`,
    icons: {
      icon: branding.logoUrl,
      shortcut: branding.logoUrl,
      apple: branding.logoUrl,
    },
  }
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const branding = await getBrandingConfig()
  const messages = await getMessages()

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <BrandingProvider branding={branding}>
          <NextIntlClientProvider messages={messages}>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster richColors position="top-center" />
          </NextIntlClientProvider>
        </BrandingProvider>
      </body>
    </html>
  )
}
