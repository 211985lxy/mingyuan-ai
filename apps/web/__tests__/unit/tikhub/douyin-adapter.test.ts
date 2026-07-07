import { afterEach, describe, expect, it, vi } from 'vitest'
import { DouyinAdapter } from '@/lib/tikhub/adapters/douyin'

describe('DouyinAdapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('resolves sec_user_id when TikHub returns the id as a string', async () => {
    vi.stubEnv('TIKHUB_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 200,
      message: 'ok',
      data: 'MS4wLjABAAAA_real_sec_user_id',
    }), { status: 200 })))

    const adapter = new DouyinAdapter({ localFallback: false })

    await expect(adapter.resolveUrl('https://v.douyin.com/example/'))
      .resolves.toBe('MS4wLjABAAAA_real_sec_user_id')
  })
})
