import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * 本地 Playwright 爬虫是一个比 fetch 更危险的出网 sink：它会启动**真实浏览器**
 * 去导航给定的 URL。本套用例证明非平台白名单的 URL 在 spawn 之前就被拦掉。
 */

const CRAWLER_PAYLOAD = JSON.stringify({
  account: { platformUserId: 'MS4wLjABAAAAtest', nickname: 'mock' },
  videos: [],
  comments: [],
})

const spawnMock = vi.fn()
const existsSyncMock = vi.fn()

vi.mock('child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}))

vi.mock('fs', () => ({
  default: { existsSync: (p: string) => existsSyncMock(p) },
  existsSync: (p: string) => existsSyncMock(p),
}))

describe('local crawler SSRF gate', () => {
  let fetchFromLocalCrawler: typeof import('@/lib/competitor-analysis/local-crawler').fetchFromLocalCrawler

  beforeEach(async () => {
    vi.clearAllMocks()
    // 让“脚本存在”为真，从而把断言点推到 URL 校验之后：
    // 若闸门失效，用例必须走到 spawn。
    existsSyncMock.mockReturnValue(true)
    // 让子进程像一次成功抓取那样完成：stdout 吐出结构化结果，close(0) 收尾。
    // 否则 fetchFromLocalCrawler 的 Promise 永远不 settle，合法域名那条会假超时。
    spawnMock.mockImplementation(() => ({
      stdout: {
        on: (_event: string, cb: (chunk: unknown) => void) => {
          cb(Buffer.from(CRAWLER_PAYLOAD))
        },
      },
      stderr: { on: () => undefined },
      on: (event: string, cb: (code: number) => void) => {
        if (event === 'close') setImmediate(() => cb(0))
      },
      kill: () => undefined,
      exitCode: null,
    }))
    fetchFromLocalCrawler = (
      await import('@/lib/competitor-analysis/local-crawler')
    ).fetchFromLocalCrawler
  })

  it('拒绝云 metadata 地址，且不得 spawn 子进程', async () => {
    await expect(
      fetchFromLocalCrawler('douyin', 'http://169.254.169.254/latest/meta-data/?x=douyin.com', 10),
    ).rejects.toThrow(/白名单/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('拒绝 localhost 与内网地址', async () => {
    for (const target of [
      'http://127.0.0.1:8080/admin',
      'http://10.0.0.5/internal',
      'http://[::1]/x',
    ]) {
      await expect(fetchFromLocalCrawler('douyin', target, 10)).rejects.toThrow(/白名单/)
    }
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('拒绝 credential 段里的伪装 host（https://v.douyin.com@evil.example/）', async () => {
    await expect(
      fetchFromLocalCrawler('douyin', 'https://v.douyin.com@evil.example/user/1', 10),
    ).rejects.toThrow(/白名单/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('拒绝后缀欺骗域名（douyin.com.evil.example）', async () => {
    await expect(
      fetchFromLocalCrawler('douyin', 'https://douyin.com.evil.example/user/1', 10),
    ).rejects.toThrow(/白名单/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('拒绝非 http(s) 协议（file:// 同样能被浏览器读取）', async () => {
    await expect(
      fetchFromLocalCrawler('douyin', 'file:///etc/passwd?x=douyin.com', 10),
    ).rejects.toThrow(/白名单/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('合法抖音/小红书域名仍放行（不因加固误伤主链路）', async () => {
    for (const target of [
      'https://www.douyin.com/user/MS4wLjABAAAAtest',
      'https://v.douyin.com/abcdef/',
      'https://www.xiaohongshu.com/user/profile/abc123',
      'https://xhslink.com/abc',
    ]) {
      await fetchFromLocalCrawler('douyin', target, 10)
    }
    expect(spawnMock).toHaveBeenCalledTimes(4)
  })
})
