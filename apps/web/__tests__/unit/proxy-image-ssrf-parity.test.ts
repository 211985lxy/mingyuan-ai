/**
 * proxy-image 接入 SSRF 共享校验源后的「覆盖面 + TOCTOU」回归。
 *
 * 背景：此前 `proxy-image-utils.ts` 维护了一份手写的 `isPrivateIpAddress`（与
 * `@/lib/ssrf-guard` 平行），覆盖面明显更窄。本文件锁死两类契约：
 *   1. 共享源覆盖到的保留/文档段必须全部判为私有（旧实现放行 TEST-NET-* 等）；
 *   2. 实际出站连接必须钉在「首次校验通过」的地址上（消除 DNS 重绑定窗口）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 首次解析返回公网地址；可被单测覆写为「二次返回内网」以模拟重绑定。
const state = { sequence: ["8.8.8.8"] as string[], calls: 0 }

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async () => {
    const address = state.sequence[Math.min(state.calls, state.sequence.length - 1)]
    state.calls += 1
    return [{ address, family: 4 }]
  }),
}))

vi.mock("@/lib/security-metrics", () => ({
  incrementSecurityMetric: vi.fn(),
}))

// 捕获 route 构造 undici Agent 时传入的参数，用于验证「钉 IP」契约。
// 不钻 Agent 内部 Symbol 私有结构 —— 那只测了 undici 的实现细节，
// 真正要锁的是 route 自己的行为：把「已校验通过的地址」交给连接池。
const agentOptions: any[] = []
vi.mock("undici", () => ({
  Agent: class {
    constructor(options: unknown) {
      agentOptions.push(options)
    }
    async close() {}
  },
}))

import { GET } from "@/app/api/proxy-image/route"
import { isPrivateIpAddress } from "@/app/api/proxy-image/proxy-image-utils"

function makeRequest(url: string) {
  const target = new URL("http://localhost/api/proxy-image")
  target.searchParams.set("url", url)
  return new NextRequest(target)
}

/** 取出 route 交给连接池的钉 IP 回调，并真的调用一次，看它把连接指向哪里。 */
async function resolvePinnedAddress(): Promise<{ address: string; family: number }> {
  const options = agentOptions.at(-1)
  expect(options).toBeDefined()
  const lookup = options?.connect?.lookup
  expect(typeof lookup).toBe("function")
  return await new Promise((resolve, reject) => {
    lookup("p3.douyinpic.com", {}, (err: Error | null, address: string, family: number) => {
      if (err) reject(err)
      else resolve({ address, family })
    })
  })
}

describe("isPrivateIpAddress — 共享校验源覆盖面", () => {
  const privateAddresses = [
    // 旧实现已覆盖的基础项（防止回归）
    "127.0.0.1",
    "10.1.2.3",
    "192.168.1.4",
    "172.16.5.6",
    "169.254.169.254", // 云元数据
    "100.64.0.1", // CGNAT
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    // 旧实现**漏判**的项 —— 收敛后必须判为私有
    "198.51.100.9", // TEST-NET-2
    "203.0.113.10", // TEST-NET-3
    "192.0.2.7", // TEST-NET-1
    "192.0.0.8", // IETF 协议分配
    "198.18.0.1", // 基准测试
    "239.1.2.3", // 组播
    "240.0.0.1", // 保留
    "::ffff:169.254.169.254", // IPv4-mapped 元数据（旧实现前缀匹配漏掉）
    "::ffff:172.16.0.1", // IPv4-mapped 私网
    "::ffff:100.64.0.1", // IPv4-mapped CGNAT
    "ff02::1", // IPv6 组播
    "2001:db8::1", // IPv6 文档保留
  ]

  it.each(privateAddresses)("判为私有：%s", (address) => {
    expect(isPrivateIpAddress(address)).toBe(true)
  })

  const publicAddresses = [
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ]

  it.each(publicAddresses)("判为公网：%s", (address) => {
    expect(isPrivateIpAddress(address)).toBe(false)
  })

  it("域名不做判定，返回 false（避免调用方误传域名时被误杀）", () => {
    expect(isPrivateIpAddress("p3.douyinpic.com")).toBe(false)
    expect(isPrivateIpAddress("example.com")).toBe(false)
  })
})

describe("GET /api/proxy-image — 出站 TOCTOU", () => {
  beforeEach(() => {
    state.sequence = ["8.8.8.8"]
    state.calls = 0
    agentOptions.length = 0
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(new Uint8Array(8).fill(1), {
        status: 200,
        headers: { "content-type": "image/jpeg", "content-length": "8" },
      }),
    ))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("把连接钉在首次解析通过的地址上，而非重新解析 hostname", async () => {
    const res = await GET(makeRequest("https://p3.douyinpic.com/a.jpg"))
    expect(res.status).toBe(200)

    // 即使 hostname 仍是域名，实际建连地址已被钉死
    await expect(resolvePinnedAddress()).resolves.toEqual({ address: "8.8.8.8", family: 4 })
    // 每个候选 URL 只解析一次 —— 不存在「校验后再解析一次」的窗口
    expect(state.calls).toBe(1)
  })

  it("钉住的地址来自解析期校验结果：重绑定后的内网 IP 不会被用于建连", async () => {
    // 模拟 DNS 重绑定：校验通过后 DNS 应答翻转为元数据地址。
    // 由于路由只解析一次并把连接钉住，第二个应答根本没有机会被使用。
    state.sequence = ["8.8.8.8", "169.254.169.254"]

    const res = await GET(makeRequest("https://p3.douyinpic.com/a.jpg"))
    expect(res.status).toBe(200)
    await expect(resolvePinnedAddress()).resolves.toEqual({ address: "8.8.8.8", family: 4 })
  })

  it("首次解析即落到私网时直接 403，不发起任何出站请求", async () => {
    state.sequence = ["169.254.169.254"]
    const res = await GET(makeRequest("https://p3.douyinpic.com/a.jpg"))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: "Resolved address is not allowed" })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("IPv4-mapped 元数据地址（旧实现漏判项）同样被拒", async () => {
    vi.mocked(await import("node:dns/promises")).lookup.mockResolvedValueOnce([
      { address: "::ffff:169.254.169.254", family: 6 },
    ] as never)
    const res = await GET(makeRequest("https://p3.douyinpic.com/a.jpg"))
    expect(res.status).toBe(403)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("域名解析失败时降级为 403，不泄漏内部异常", async () => {
    const dns = await import("node:dns/promises")
    vi.mocked(dns.lookup).mockRejectedValueOnce(new Error("ENOTFOUND"))
    const res = await GET(makeRequest("https://p3.douyinpic.com/a.jpg"))
    expect(res.status).toBe(403)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
