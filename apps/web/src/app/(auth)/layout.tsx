"use client"

import { BrandLogo } from "@/components/branding/brand-logo"
import { useBranding } from "@/components/providers/branding-provider"

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const branding = useBranding()

  return (
    <div className="min-h-screen flex items-start sm:items-center justify-center overflow-x-hidden bg-muted/30 px-4 pt-[12vh] sm:px-6 sm:pt-0">
      <div
        className="mx-auto min-w-0 [&>[data-slot=card]]:w-full"
        style={{ width: "100%", maxWidth: "min(28rem, calc(100vw - 2rem))" }}
      >
        <div className="mb-6 flex min-w-0 items-center justify-center gap-2">
          <BrandLogo className="h-10 w-10" />
          <span className="min-w-0 text-center text-2xl font-bold leading-tight">
            {branding.name}
          </span>
        </div>
        {children}
      </div>
    </div>
  )
}
