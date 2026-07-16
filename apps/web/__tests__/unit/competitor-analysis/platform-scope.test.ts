import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCompetitorPlatformGate } from '@/lib/competitor-analysis/platform-scope'

const mockEnv = vi.hoisted<Record<string, string | undefined>>(() => ({}))

vi.mock('@/env', () => ({ env: mockEnv }))

describe('getCompetitorPlatformGate', () => {
  afterEach(() => {
    mockEnv.COMPETITOR_ENABLED_PLATFORMS = undefined
  })

  it('allows Douyin in the local-browser MVP', () => {
    expect(getCompetitorPlatformGate('douyin')).toEqual({ supported: true })
  })

  it('allows Xiaohongshu by default', () => {
    expect(getCompetitorPlatformGate('xiaohongshu')).toEqual({ supported: true })
  })

  it('can close Xiaohongshu through the platform allowlist', () => {
    mockEnv.COMPETITOR_ENABLED_PLATFORMS = 'douyin'

    expect(getCompetitorPlatformGate('xiaohongshu')).toEqual({
      supported: false,
      code: 'PLATFORM_NOT_OPEN',
      message: '当前版本暂不支持小红书对标账号分析',
    })
  })
})
