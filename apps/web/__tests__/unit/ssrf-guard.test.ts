import { beforeEach, describe, expect, it, vi } from "vitest"

// node:dns / undici 在单测里不真连网：分别替身为可控 mock。
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }))
vi.mock("undici", () => ({
  Agent: class {
    close() {
      return Promise.resolve()
    }
  },
}))

import { lookup } from "node:dns/promises"
import {
  classifyIpv4,
  classifyIpv6,
  isIpLiteral,
  isPublicIp,
  SsrfBlockedError,
} from "@/lib/ssrf-guard"
import { probeRedirect, resolvePublicTarget } from "@/lib/ssrf-guard.server"

const mockedLookup = vi.mocked(lookup)

beforeEach(() => {
  mockedLookup.mockReset()
  vi.unstubAllGlobals()
})

describe("isPublicIp —— IPv4 分类", () => {
  it("放行公网地址", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "203.0.114.1", "172.32.0.1", "100.63.0.1"]) {
      expect(isPublicIp(ip), ip).toBe(true)
    }
  })

  it("拦截回环 / 私有 / 链路本地 / 云元数据 / CGNAT / 组播 / 保留", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.2.3",
      "10.0.0.5",
      "172.16.3.4",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // 云元数据
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // 组播
      "240.0.0.1", // 保留
      "255.255.255.255",
      "192.0.2.10", // TEST-NET
    ]) {
      expect(isPublicIp(ip), ip).toBe(false)
    }
  })

  it("非 IP 字面量返回 false", () => {
    expect(isPublicIp("v.douyin.com")).toBe(false)
    expect(classifyIpv4("v.douyin.com")).toBeNull()
  })
})

describe("isPublicIp —— IPv6 分类", () => {
  it("拦截回环 / ULA / 链路本地 / 组播 / 文档 / IPv4-mapped 元数据", () => {
    for (const ip of [
      "::1",
      "::",
      "fd00:ec2::254", // AWS IMDSv2 over IPv6
      "fc00::1",
      "fe80::1",
      "ff02::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:a9fe:a9fe", // 同上的十六进制写法
    ]) {
      expect(isPublicIp(ip), ip).toBe(false)
    }
  })

  it("放行公网 IPv6", () => {
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true)
    expect(classifyIpv6("2606:4700:4700::1111")).toBe(true)
  })
})

// 点分形式的 IPv4-mapped IPv6（`::ffff:169.254.169.254`）是 AWS/GCP 元数据地址的常见写法。
// 早前解析器只认十六进制分组，导致这类地址被判成「非 IP 字面量」—— `isPublicIp` 靠
// `?? false` 侥幸挡住，但任何依赖 `isIpLiteral` 的调用方会 fail-open。此处锁死能力本身。
describe("IPv6 内嵌点分 IPv4 —— 字面量识别（fail-open 回归）", () => {
  it("点分内嵌写法必须被识别为 IP 字面量", () => {
    for (const ip of ["::ffff:169.254.169.254", "::ffff:127.0.0.1", "::ffff:8.8.8.8"]) {
      expect(isIpLiteral(ip), ip).toBe(true)
    }
  })

  it("classifyIpv6 给出明确判定而非 null（null 代表无法识别）", () => {
    expect(classifyIpv6("::ffff:169.254.169.254")).toBe(false)
    expect(classifyIpv6("::ffff:8.8.8.8")).toBe(true)
  })

  it("带方括号、带 zone id 的点分内嵌同样识别", () => {
    expect(isIpLiteral("[::ffff:169.254.169.254]")).toBe(true)
    expect(isPublicIp("::ffff:169.254.169.254%eth0")).toBe(false)
  })

  it("点分内嵌 + :: 压缩组合（NAT64 / 兼容地址）不放水", () => {
    expect(isPublicIp("::127.0.0.1")).toBe(false) // IPv4-compatible
    expect(isPublicIp("64:ff9b::127.0.0.1")).toBe(false) // NAT64 + 回环内嵌
  })
})

describe("isIpLiteral", () => {
  it("识别 IPv4 / 带括号 IPv6，域名不算", () => {
    expect(isIpLiteral("127.0.0.1")).toBe(true)
    expect(isIpLiteral("[::1]")).toBe(true)
    expect(isIpLiteral("v.douyin.com")).toBe(false)
    // 十进制/十六进制需先经 new URL 归一化，裸串不算 IP 字面量
    expect(isIpLiteral("2130706433")).toBe(false)
  })
})

describe("resolvePublicTarget —— IP 字面量（依赖 new URL 归一化）", () => {
  it("十进制/八进制/十六进制回环全部拒绝", async () => {
    for (const url of [
      "http://2130706433/",
      "http://0x7f000001/",
      "http://0177.0.0.1/",
      "http://127.1/",
    ]) {
      await expect(resolvePublicTarget(url), url).rejects.toBeInstanceOf(SsrfBlockedError)
    }
  })

  it("云元数据（IPv4 与 IPv4-mapped IPv6）拒绝", async () => {
    await expect(resolvePublicTarget("http://169.254.169.254/latest/meta-data/")).rejects.toBeInstanceOf(SsrfBlockedError)
    await expect(resolvePublicTarget("http://[::ffff:169.254.169.254]/")).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it("协议与内嵌凭据拒绝", async () => {
    await expect(resolvePublicTarget("ftp://example.com/")).rejects.toBeInstanceOf(SsrfBlockedError)
    await expect(resolvePublicTarget("http://user:pass@example.com/")).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it("公网 IP 字面量通过且无需 DNS", async () => {
    const target = await resolvePublicTarget("https://1.1.1.1/path")
    expect(target.address).toBe("1.1.1.1")
    expect(target.family).toBe(4)
    expect(mockedLookup).not.toHaveBeenCalled()
  })
})

describe("resolvePublicTarget —— 域名解析", () => {
  it("多 A 记录只要一条非公网即整体拒绝（DNS 重绑定防护）", async () => {
    mockedLookup.mockResolvedValue([
      { address: "1.2.3.4", family: 4 },
      { address: "192.168.1.1", family: 4 },
    ] as never)
    await expect(resolvePublicTarget("https://rebind.example/")).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it("全部公网时通过并返回首个地址用于钉住", async () => {
    mockedLookup.mockResolvedValue([{ address: "1.2.3.4", family: 4 }] as never)
    const target = await resolvePublicTarget("https://ok.example/x")
    expect(target.address).toBe("1.2.3.4")
    expect(target.family).toBe(4)
  })

  it("解析失败拒绝", async () => {
    mockedLookup.mockRejectedValue(new Error("ENOTFOUND"))
    await expect(resolvePublicTarget("https://nx.example/")).rejects.toBeInstanceOf(SsrfBlockedError)
  })
})

describe("probeRedirect —— 跳转目标二次校验", () => {
  it("302 跳到云元数据被拒", async () => {
    mockedLookup.mockResolvedValue([{ address: "1.2.3.4", family: 4 }] as never)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
      ),
    )
    await expect(probeRedirect("https://v.douyin.com/abc/")).rejects.toBeInstanceOf(SsrfBlockedError)
  })

  it("302 跳到公网返回规范化后的跳转目标", async () => {
    mockedLookup.mockResolvedValue([{ address: "1.2.3.4", family: 4 }] as never)
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://www.douyin.com/video/123" } }),
      ),
    )
    await expect(probeRedirect("https://v.douyin.com/abc/")).resolves.toBe("https://www.douyin.com/video/123")
  })

  it("无 location 返回 null", async () => {
    mockedLookup.mockResolvedValue([{ address: "1.2.3.4", family: 4 }] as never)
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
    await expect(probeRedirect("https://v.douyin.com/abc/")).resolves.toBeNull()
  })
})
