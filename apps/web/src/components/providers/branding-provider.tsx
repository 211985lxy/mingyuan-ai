"use client"

import React from "react"
import {
  FALLBACK_BRANDING,
  type BrandingConfig,
} from "@/lib/branding-config"

interface BrandingContextValue extends BrandingConfig {
  updateBranding: (next: Partial<BrandingConfig>) => void
}

const BrandingContext = React.createContext<BrandingContextValue>({
  ...FALLBACK_BRANDING,
  updateBranding: () => {},
})

/**
 * @description brandingprovider
 * @param options - 配置选项
 * @returns 无返回值
 */
export function BrandingProvider({
  branding,
  children,
}: {
  branding: BrandingConfig
  children: React.ReactNode
}) {
  const [value, setValue] = React.useState<BrandingConfig>(branding)

  const updateBranding = (next: Partial<BrandingConfig>) => {
    setValue((current) => ({ ...current, ...next }))
  }

  return (
    <BrandingContext.Provider value={{ ...value, updateBranding }}>
      {children}
    </BrandingContext.Provider>
  )
}

/**
 * @description React Hook：branding
 * @returns 无返回值
 */
export function useBranding() {
  const branding = React.useContext(BrandingContext)
  return {
    name: branding.name,
    logoUrl: branding.logoUrl,
    defaultName: branding.defaultName,
    defaultLogoUrl: branding.defaultLogoUrl,
  }
}

/**
 * @description React Hook：brandingcontrols
 * @returns 无返回值
 */
export function useBrandingControls() {
  return React.useContext(BrandingContext).updateBranding
}
