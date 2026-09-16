/**
 * F18 关闭 DoD 补测 —— 安全官（security-officer）验收口径缺的三项证据。
 *
 * 此前 `ssrf-guard.test.ts` 只测**纯函数模块**与 **sink 单元**，无法回答三个问题：
 *   1. 强校验源是否真的挂在 **TS 入口**（而不是只在 Python 侧 / 只在纯函数里）；
 *   2. cron / 存储型二阶路径（F18-B）是否真的流过 sink——即库内已存在的恶意 URL；
 *   3. 两次解析的 DNS 重绑定（F2 TOCTOU）是否被封死，而不是只测「单次混合 A 记录」。
 *
 * 本文件专门补这三项。与 `ssrf-guard.test.ts` 不同，这里**不 mock sink 本身**：
 * 只替身 `node:dns/promises` 与 `undici`，让真实的 `probeRedirect` → `resolvePublicTarget`
 * 链路跑起来，否则「守卫被调用过」这个断言就是自证。
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type PinnedLookup = (
  hostname: string,
  options: unknown,
  callback: (error: Error | null, address?: string, family?: number) => void,
) => void

interface CapturedAgentConfig {
  connect?: { lookup?: PinnedLookup }
}

// vi.mock 工厂会被提升到 import 之前，故用 vi.hoisted 共享捕获数组（避免 TDZ）。
const { agentConfigs } = vi.hoisted(() => ({ agentConfigs: [] as CapturedAgentConfig[] }))

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }))
vi.mock("undici", () => ({
  Agent: class {
    constructor(options: unknown) {
      agentConfigs.push(options as CapturedAgentConfig)
    }

    close() {
      return Promise.resolve()
    }
  },
}))

import { lookup } from "node:dns/promises"
import { runOutcomeAutofetch, type OutcomeAutofetchStore } from "@/lib/aim/outcome-autofetch"
import { isDouyinShortUrl } from "@/lib/douyin-short-url"
import { resolveDouyinShortUrl } from "@/lib/douyin-short-url-resolver"
import { probeRedirect, resolvePublicTarget, SsrfBlockedError } from "@/lib/ssrf-guard.server"
import {
  assertSupportedVideoUrl,
  detectVideoPlatform,
  extractVideoUrlFromText,
} from "@/lib/video-text-extractor"

const mockedLookup = vi.mocked(lookup)

const PUBLIC_RECORD = [{ address: "1.2.3.4", family: 4 }]
const METADATA_RECORD = [{ address: "169.254.169.254", family: 4 }]
const SHORT_URL = "https://v.douyin.com/AbCdEf/"
const LONG_URL = "https://www.douyin.com/video/7123456789012345678"
const NOW = new Date("2026-09-16T00:00:00.000Z")

/** 库内伪冒主机：`hostname.endsWith(".douyin.com")` 为假，旧子串实现会误判为抖音。 */
const SPOOFED_DOUYIN_HOSTS = [
  "https://v.douyin.com.evil.com/iABC/",
  "https://douyin.com.evil.com/iABC/",
  "https://iesdouyin.com.evil.com/iABC/",
  "https://xdouyin.com/iABC/",
  "https://evil.com/?next=v.douyin.com/iABC/",
]

/** IP 表述绕过向量：八/十/十六进制、短式、元数据、私网、IPv4-mapped、ULA。 */
const BLOCKED_IP_URLS = [
  "http://2130706433/",
  "http://0x7f000001/",
  "http://0177.0.0.1/",
  "http://127.1/",
  "http://169.254.169.254/latest/meta-data/",
  "http://10.0.0.5/",
  "http://192.168.1.1/",
  "http://[::ffff:169.254.169.254]/",
  "http://[fd00:ec2::254]/",
  "http://[::1]/",
]

function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

/** 只实现 F18-B 所需的 store 能力，其余方法显式抛错以避免「静默不覆盖」。 */
function buildStore(input: {
  publishUrl: string | null
  videos?: Array<{ itemId: string }>
}): OutcomeAutofetchStore {
  const unused = (name: string) => () => {
    throw new Error(`本用例不应调用 store.${name}`)
  }
  return {
    listPublishedGenerations: async () => [
      {
        id: "g1",
        userId: "u1",
        projectId: null,
        topicSelectionId: null,
        publishPlatform: "抖音",
        publishUrl: input.publishUrl,
        publishedAt: new Date("2026-09-10T00:00:00.000Z"),
      },
    ],
    listBindings: async () => (input.videos ? [{ id: "b1", userId: "u1", openId: "o1" }] : []),
    fetchVideosForBinding: async () =>
      (input.videos ?? []).map((video) => ({
        itemId: video.itemId,
        videoId: null,
        shareUrl: null,
        statistics: { playCount: 42 },
      })),
    upsertContentSignals: async () => undefined,
    markBindingExpired: unused("markBindingExpired") as never,
    alert: unused("alert") as never,
  }
}

beforeEach(() => {
  mockedLookup.mockReset()
  agentConfigs.length = 0
  vi.unstubAllGlobals()
})

describe("DoD-1 · 强校验源必须挂在 TS 入口（parity 跑在入口而非仅 Python / 纯函数）", () => {
  it("伪冒子域在 detectVideoPlatform 即判 unknown（旧子串实现会判 douyin）", () => {
    for (const url of SPOOFED_DOUYIN_HOSTS) {
      expect(detectVideoPlatform(url), url).toBe("unknown")
    }
  })

  it("同一组伪冒主机在 sink 侧也不被认作抖音短链", () => {
    for (const url of SPOOFED_DOUYIN_HOSTS) {
      expect(isDouyinShortUrl(url), url).toBe(false)
    }
  })

  it("extractVideoUrlFromText 在入口就拒绝伪冒主机，根本到不了 sink", () => {
    for (const url of SPOOFED_DOUYIN_HOSTS) {
      expect(() => extractVideoUrlFromText(url), url).toThrow(/暂不支持这个视频平台/)
    }
  })

  it("抖音真实子域仍按平台识别（后缀白名单不是「只认主域」的误杀）", () => {
    // 这些是抖音自有子域，攻击者无法持有；sink 的严格相等白名单另有限制。
    expect(detectVideoPlatform("https://www.douyin.com/video/123")).toBe("douyin")
    expect(detectVideoPlatform("https://notv.douyin.com/iABC/")).toBe("douyin")
    // 但短链 sink 只认 v.douyin.com 这一个主机。
    expect(isDouyinShortUrl("https://notv.douyin.com/iABC/")).toBe(false)
    expect(isDouyinShortUrl("https://www.douyin.com/iABC/")).toBe(false)
  })
})

describe("DoD-2 · 入口与 sink 共用同一强校验源（IP 表述向量 parity）", () => {
  it("入口 assertSupportedVideoUrl 拒绝全部 IP 表述绕过向量", () => {
    for (const url of BLOCKED_IP_URLS) {
      expect(() => assertSupportedVideoUrl(url), url).toThrow(/公开视频链接/)
    }
  })

  it("sink resolvePublicTarget 对同一组向量全部拒绝（同一判定源，无第二套规则）", async () => {
    for (const url of BLOCKED_IP_URLS) {
      await expect(resolvePublicTarget(url), url).rejects.toBeInstanceOf(SsrfBlockedError)
    }
  })
})

describe("DoD-3 · 实时路径（F18-A）：sink 真的执行共享校验", () => {
  it("合法短链触发解析，且确实过了 DNS 校验（lookup 被调用）", async () => {
    mockedLookup.mockResolvedValue(PUBLIC_RECORD as never)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirectTo(LONG_URL)))

    await expect(resolveDouyinShortUrl(SHORT_URL)).resolves.toBe(LONG_URL)
    expect(mockedLookup).toHaveBeenCalledWith("v.douyin.com", { all: true, verbatim: true })
  })

  it("伪冒主机不进 sink：零请求、零解析", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const evil = "https://v.douyin.com.evil.com/AbCdEf/"

    await expect(resolveDouyinShortUrl(evil)).resolves.toBe(evil)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockedLookup).not.toHaveBeenCalled()
  })
})

describe("DoD-4 · cron / 存储型二阶路径（F18-B）：消费库内 publishUrl", () => {
  it("对照组：库内合法短链可正常回流（证明本用例组真能跑通到 upsert）", async () => {
    mockedLookup.mockResolvedValue(PUBLIC_RECORD as never)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirectTo(LONG_URL)))

    const summary = await runOutcomeAutofetch({
      store: buildStore({ publishUrl: SHORT_URL, videos: [{ itemId: "7123456789012345678" }] }),
      now: NOW,
    })

    expect(summary.upserted).toBe(1)
    expect(summary.needsBackfill).toHaveLength(0)
  })

  it("库内伪冒短链（存量投毒）：分类阶段即判 missing，零出站", async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)

    const summary = await runOutcomeAutofetch({
      store: buildStore({ publishUrl: "https://v.douyin.com.evil.com/iABC/" }),
      now: NOW,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(mockedLookup).not.toHaveBeenCalled()
    expect(summary.upserted).toBe(0)
    expect(summary.needsBackfill.map((item) => item.reason)).toContain("unparseable_work_key")
  })

  it("库内合法短链被投毒 302 → 云元数据：跳转目标二次校验拦截，绝不打元数据地址", async () => {
    mockedLookup.mockResolvedValue(PUBLIC_RECORD as never)
    // 跳转目标刻意带上可解析的 aweme_id：若「二次校验」缺失，该 id 会被取出并回流，
    // upserted 会变成 1。故这条断言能真正区分「拦住了」与「只是恰好解析不出」。
    const fetchSpy = vi.fn().mockResolvedValue(redirectTo("http://169.254.169.254/video/7123456789012345678"))
    vi.stubGlobal("fetch", fetchSpy)

    const summary = await runOutcomeAutofetch({
      store: buildStore({ publishUrl: SHORT_URL, videos: [{ itemId: "7123456789012345678" }] }),
      now: NOW,
    })

    expect(summary.upserted).toBe(0)
    expect(summary.needsBackfill.map((item) => item.reason)).toContain("unparseable_work_key")
    // 只发了第一跳，且从未向元数据地址发起请求。
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    for (const [target] of fetchSpy.mock.calls) {
      expect(String(target)).not.toContain("169.254.169.254")
    }
  })
})

describe("DoD-5 · 两次解析的 DNS 重绑定（F2 TOCTOU）", () => {
  it("校验用第 1 次解析，连接钉在同一地址；第 2 次解析不参与连接", async () => {
    mockedLookup
      .mockResolvedValueOnce(PUBLIC_RECORD as never)
      .mockResolvedValueOnce(METADATA_RECORD as never)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    await probeRedirect(SHORT_URL)

    // 只解析一次——连接前没有「再解析一遍」的窗口。
    expect(mockedLookup).toHaveBeenCalledTimes(1)
    const config = agentConfigs.at(-1)
    expect(config?.connect?.lookup).toBeTypeOf("function")

    let pinned: { address?: string; family?: number } = {}
    config?.connect?.lookup?.("v.douyin.com", {}, (_error, address, family) => {
      pinned = { address, family }
    })
    expect(pinned).toEqual({ address: "1.2.3.4", family: 4 })
  })

  it("跳转目标是域名时按自身解析结果校验：第二次解析返私网即拒绝", async () => {
    mockedLookup
      .mockResolvedValueOnce(PUBLIC_RECORD as never)
      .mockResolvedValueOnce(METADATA_RECORD as never)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirectTo("https://rebind.example/x")))

    await expect(probeRedirect(SHORT_URL)).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(mockedLookup).toHaveBeenCalledTimes(2)
  })
})
