import { describe, expect, it } from 'vitest'
import { getCompetitorPlatformGate } from '@/lib/competitor-analysis/platform-scope'

describe('getCompetitorPlatformGate', () => {
  it('allows Douyin in the local-browser MVP', () => {
    expect(getCompetitorPlatformGate('douyin')).toEqual({ supported: true })
  })

  it('keeps Xiaohongshu closed in the first release', () => {
    expect(getCompetitorPlatformGate('xiaohongshu')).toEqual({
      supported: false,
      code: 'PLATFORM_NOT_OPEN',
      message: '第一版对标账号分析暂时只支持抖音主页链接',
    })
  })
})
