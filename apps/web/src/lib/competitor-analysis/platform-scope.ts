import type { Platform } from './types'

export interface CompetitorPlatformGate {
  supported: boolean
  code?: 'PLATFORM_NOT_OPEN'
  message?: string
}

/**
 * 获取平台门控状态。
 * 支持通过环境变量 COMPETITOR_ENABLED_PLATFORMS 灰度控制（逗号分隔）。
 * 默认放开抖音和小红书。
 */
export function getCompetitorPlatformGate(platform: Platform): CompetitorPlatformGate {
  const enabledPlatforms = (process.env.COMPETITOR_ENABLED_PLATFORMS || 'douyin,xiaohongshu')
    .split(',')
    .map((p) => p.trim().toLowerCase())

  if (enabledPlatforms.includes(platform)) {
    return { supported: true }
  }

  return {
    supported: false,
    code: 'PLATFORM_NOT_OPEN',
    message: `当前版本暂不支持${platformLabel(platform)}对标账号分析`,
  }
}

function platformLabel(platform: string): string {
  const labels: Record<string, string> = {
    douyin: '抖音',
    xiaohongshu: '小红书',
    bilibili: 'B站',
    kuaishou: '快手',
  }
  return labels[platform] || platform
}
