import { BRANDING_SYSTEM_SETTINGS } from "./branding-config"

export interface SystemSettingSeed {
  key: string
  value: string
  type: string
  category: string
  description: string
}

export const DEFAULT_SYSTEM_SETTINGS: readonly SystemSettingSeed[] = [
  {
    key: "registration-enabled",
    value: "true",
    type: "boolean",
    category: "features",
    description: "Whether new user registration is enabled",
  },
  {
    key: "max-videos-free",
    value: "5",
    type: "number",
    category: "limits",
    description: "Maximum videos for free plan users",
  },
  {
    key: "max-videos-basic",
    value: "50",
    type: "number",
    category: "limits",
    description: "Maximum videos for basic plan users",
  },
  {
    key: "max-videos-pro",
    value: "500",
    type: "number",
    category: "limits",
    description: "Maximum videos for pro plan users",
  },
  ...BRANDING_SYSTEM_SETTINGS,
]
