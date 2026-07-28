import { describe, it, expect } from 'vitest'
import { checkUrlType, detectPlatform, extractUserId, parseUrl } from '@/lib/tikhub/url-parser'

describe('detectPlatform', () => {
  // Douyin patterns
  it('returns douyin for www.douyin.com user URL', () => {
    expect(detectPlatform('https://www.douyin.com/user/MS4wLjABAAAAtest')).toBe('douyin')
  })

  it('returns douyin for v.douyin.com share URL', () => {
    expect(detectPlatform('https://v.douyin.com/abc123/')).toBe('douyin')
  })

  it('returns douyin for iesdouyin.com share URL', () => {
    expect(detectPlatform('https://www.iesdouyin.com/share/user/abc')).toBe('douyin')
  })

  // Xiaohongshu patterns
  it('returns xiaohongshu for xiaohongshu.com profile URL', () => {
    expect(detectPlatform('https://www.xiaohongshu.com/user/profile/abc123')).toBe('xiaohongshu')
  })

  it('returns xiaohongshu for xhslink.com URL', () => {
    expect(detectPlatform('https://xhslink.com/abc')).toBe('xiaohongshu')
  })

  it('returns xiaohongshu for xhs.cn URL', () => {
    expect(detectPlatform('https://www.xhs.cn/user/abc')).toBe('xiaohongshu')
  })

  // Deferred platforms
  it('returns null for bilibili.com (deferred MVP)', () => {
    expect(detectPlatform('https://www.bilibili.com/space/123456')).toBeNull()
  })

  // Invalid / unsupported
  it('returns null for unsupported domain', () => {
    expect(detectPlatform('https://invalid.com/user/abc')).toBeNull()
  })

  it('returns null for non-URL string without throwing', () => {
    expect(detectPlatform('not a url')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(detectPlatform('')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(detectPlatform('https://WWW.DOUYIN.COM/user/abc')).toBe('douyin')
  })

  it('returns wechat_channels for channels.weixin.qq.com profile URL', () => {
    expect(
      detectPlatform(
        'https://channels.weixin.qq.com/web/pages/profile/v2_abc@finder',
      ),
    ).toBe('wechat_channels')
  })

  it('returns wechat_channels for finder.video.qq.com URL', () => {
    expect(detectPlatform('https://finder.video.qq.com/mfinder/v2_abc@finder')).toBe(
      'wechat_channels',
    )
  })
})

describe('extractUserId', () => {
  // Douyin: segment after 'user'
  it('extracts userId from douyin user URL', () => {
    expect(extractUserId('https://www.douyin.com/user/MS4wLjABAAAAtest')).toBe('MS4wLjABAAAAtest')
  })

  it('returns null for douyin URL with no userId after user path', () => {
    expect(extractUserId('https://www.douyin.com/user/')).toBeNull()
  })

  it('returns null for douyin URL with no user path', () => {
    expect(extractUserId('https://www.douyin.com/')).toBeNull()
  })

  // XHS: segment after 'profile'
  it('extracts userId from xiaohongshu profile URL', () => {
    expect(extractUserId('https://www.xiaohongshu.com/user/profile/abc123def')).toBe('abc123def')
  })

  // Non-parseable
  it('returns null for non-URL without throwing', () => {
    expect(extractUserId('not a url')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractUserId('')).toBeNull()
  })

  it('extracts finder_username from wechat channels profile URL', () => {
    expect(
      extractUserId(
        'https://channels.weixin.qq.com/web/pages/profile/v2_abc123@finder',
      ),
    ).toBe('v2_abc123@finder')
  })

  it('decodes encoded finder_username from wechat channels profile URL', () => {
    expect(
      extractUserId(
        'https://channels.weixin.qq.com/web/pages/profile/v2_abc123%40finder',
      ),
    ).toBe('v2_abc123@finder')
  })
})

describe('parseUrl', () => {
  it('returns ParsedUrl for a valid douyin URL', () => {
    const result = parseUrl('https://www.douyin.com/user/MS4wLjABAAAAtest')
    expect(result).not.toBeNull()
    expect(result?.platform).toBe('douyin')
    expect(result?.rawUserId).toBe('MS4wLjABAAAAtest')
  })

  it('returns ParsedUrl for a valid xiaohongshu URL', () => {
    const result = parseUrl('https://www.xiaohongshu.com/user/profile/abc123')
    expect(result).not.toBeNull()
    expect(result?.platform).toBe('xiaohongshu')
    expect(result?.rawUserId).toBe('abc123')
  })

  it('returns ParsedUrl for a wechat channels profile URL', () => {
    const result = parseUrl(
      'https://channels.weixin.qq.com/web/pages/profile/v2_abc123@finder',
    )
    expect(result).not.toBeNull()
    expect(result?.platform).toBe('wechat_channels')
    expect(result?.rawUserId).toBe('v2_abc123@finder')
  })

  it('returns null for unsupported URL', () => {
    expect(parseUrl('https://invalid.com/user/abc')).toBeNull()
  })

  it('returns null for non-URL string', () => {
    expect(parseUrl('not a url')).toBeNull()
  })
})

describe('checkUrlType', () => {
  it('rejects douyin video links as account homepage input', () => {
    expect(checkUrlType('https://www.douyin.com/video/7123456789012345678')).toContain('请输入账号的个人主页链接')
  })

  it('allows douyin account homepage links', () => {
    expect(checkUrlType('https://www.douyin.com/user/MS4wLjABAAAAtest')).toBeNull()
  })
})
