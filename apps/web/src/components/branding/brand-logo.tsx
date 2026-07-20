"use client"

import { useBranding } from "@/components/providers/branding-provider"
import { cn } from "@/lib/utils"

/**
 * @description brandlogo
 * @param options - 配置选项
 * @returns 无返回值
 */
export function BrandLogo({
  className,
  alt,
}: {
  className?: string
  alt?: string
}) {
  const branding = useBranding()

  return (
    <img
      src={branding.logoUrl}
      alt={alt ?? `${branding.name} logo`}
      className={cn("shrink-0 object-contain", className)}
    />
  )
}
