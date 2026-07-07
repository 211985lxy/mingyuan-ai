export interface BrandingConfig {
  name: string
  logoUrl: string
  defaultName: string
  defaultLogoUrl: string
}

export const BRANDING_SETTING_KEYS = {
  name: "branding-name",
  logoUrl: "branding-logo-url",
  defaultName: "branding-default-name",
  defaultLogoUrl: "branding-default-logo-url",
} as const

export const DEFAULT_BRANDING_BASELINE = {
  name: "明远AIM智能体",
  logoUrl: "/branding/mingyuan-default-logo.svg",
} as const

export const ACTIVE_BRANDING_SEED = {
  name: "明远AIM智能体",
  logoUrl: "/branding/mingyuan-aim-logo.svg",
} as const

export const BRAND_NAME = "明远AIM"

export const FALLBACK_BRANDING: BrandingConfig = {
  name: ACTIVE_BRANDING_SEED.name,
  logoUrl: ACTIVE_BRANDING_SEED.logoUrl,
  defaultName: DEFAULT_BRANDING_BASELINE.name,
  defaultLogoUrl: DEFAULT_BRANDING_BASELINE.logoUrl,
}

export const BRANDING_SYSTEM_SETTINGS = [
  {
    key: BRANDING_SETTING_KEYS.defaultName,
    value: DEFAULT_BRANDING_BASELINE.name,
    type: "string",
    category: "branding",
    description: "OEM 默认系统名称，支持回退或重置为原始品牌",
  },
  {
    key: BRANDING_SETTING_KEYS.defaultLogoUrl,
    value: DEFAULT_BRANDING_BASELINE.logoUrl,
    type: "string",
    category: "branding",
    description: "OEM 默认系统 Logo 地址，保存原始品牌素材",
  },
  {
    key: BRANDING_SETTING_KEYS.name,
    value: ACTIVE_BRANDING_SEED.name,
    type: "string",
    category: "branding",
    description: "当前生效的系统名称，前后台统一读取",
  },
  {
    key: BRANDING_SETTING_KEYS.logoUrl,
    value: ACTIVE_BRANDING_SEED.logoUrl,
    type: "string",
    category: "branding",
    description: "当前生效的系统 Logo 地址，前后台统一读取",
  },
] as const

const BRANDING_KEY_SET = new Set<string>(
  Object.values(BRANDING_SETTING_KEYS)
)

export function isBrandingSettingKey(key: string): boolean {
  return BRANDING_KEY_SET.has(key)
}
