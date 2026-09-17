/**
 * SSRF 出站守卫 —— 服务端网络层（依赖 node:dns / undici）。
 *
 * 与纯函数层 `@/lib/ssrf-guard` 组合成「单一共享校验源」：
 *   1. 解析 DNS，要求**全部**解析地址均为公网（挡 169.254.169.254 / 私网 / 重绑定多 A）；
 *   2. 把解析到的 IP 钉死用于实际连接（undici lookup 覆写），消除「校验后二次解析」的 TOCTOU；
 *   3. 只发「不自动跟随重定向」的请求，跳转目标由调用方再次过校验。
 *
 * 仅服务端可用；禁止被 "use client" 模块静态引用。
 */
import { lookup } from "node:dns/promises"
import { Agent } from "undici"

import { classifyIpv4, classifyIpv6, SsrfBlockedError } from "@/lib/ssrf-guard"

export { SsrfBlockedError } from "@/lib/ssrf-guard"

export interface PublicTarget {
  url: URL
  /** 已解析并校验通过的地址，用于钉住连接 */
  address: string
  family: 4 | 6
}

/**
 * 解析并校验 URL：仅 http(s)、无内嵌凭据、主机解析到的**全部**地址均为公网。
 * 返回首个解析地址用于钉住连接。
 */
export async function resolvePublicTarget(rawUrl: string): Promise<PublicTarget> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new SsrfBlockedError("链接格式不正确")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError("仅支持 http/https 链接")
  }
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError("链接不允许携带凭据")
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "")

  // IP 字面量：直接判定，不做 DNS（new URL 已把八/十/十六进制 IPv4 归一化为点分）
  const ipv4 = classifyIpv4(host)
  if (ipv4 !== null) {
    if (!ipv4) throw new SsrfBlockedError("目标为内网/保留 IP，已拒绝")
    return { url: parsed, address: host, family: 4 }
  }
  const ipv6 = classifyIpv6(host)
  if (ipv6 !== null) {
    if (!ipv6) throw new SsrfBlockedError("目标为内网/保留 IP，已拒绝")
    return { url: parsed, address: host, family: 6 }
  }

  let records: Array<{ address: string; family: number }>
  try {
    records = await lookup(host, { all: true, verbatim: true })
  } catch {
    throw new SsrfBlockedError("目标域名无法解析")
  }
  if (records.length === 0) throw new SsrfBlockedError("目标域名无法解析")

  for (const record of records) {
    const ok = record.family === 4 ? classifyIpv4(record.address) : classifyIpv6(record.address)
    if (ok !== true) throw new SsrfBlockedError("目标解析到内网/保留地址，已拒绝")
  }

  const chosen = records[0]
  return { url: parsed, address: chosen.address, family: chosen.family === 6 ? 6 : 4 }
}

/** 校验并返回规范化后的 URL；不通过则抛 {@link SsrfBlockedError}。 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  return (await resolvePublicTarget(rawUrl)).url
}

/**
 * 构造「把连接钉死在指定地址」的 undici dispatcher。
 *
 * **必须兼容 Node 的 `autoSelectFamily`**：Node 18.13+ 默认开启该特性，`net.connect`
 * 会以 `{ all: true, hints: ... }` 调用 lookup，此时回调**必须返回数组**。若按传统
 * `cb(null, address, family)` 三参形式回，undici 会抛 `ERR_INVALID_IP_ADDRESS`，
 * 请求**直接失败**（不是降级、不是退回未钉 IP）——而调用方通常把异常吞掉，
 * 于是表现为「功能静默失效」，最难排查。
 *
 * 同时保留非 all 模式的三参回法，兼容 `autoSelectFamily: false` 或未来行为变化。
 */
export function createPinnedAgent(address: string, family: 4 | 6): Agent {
  type AllCallback = (error: null, addresses: Array<{ address: string; family: number }>) => void
  type SingleCallback = (error: null, address: string, family: number) => void

  return new Agent({
    connect: {
      lookup: (_hostname, options, callback) => {
        if (options?.all) {
          ;(callback as unknown as AllCallback)(null, [{ address, family }])
          return
        }
        ;(callback as unknown as SingleCallback)(null, address, family)
      },
    },
  })
}

/**
 * 以钉住的 IP 发起一次「不自动跟随重定向」的请求，返回校验过的跳转目标。
 *
 * - 连接地址 = 首次解析结果（防重绑定）；Host/SNI 仍为原域名；
 * - 跳转目标会再过一次 {@link resolvePublicTarget}，非公网直接拒绝；
 * - 无 location 或非公网跳转返回 null，由调用方降级。
 */
export async function probeRedirect(rawUrl: string, init: RequestInit = {}): Promise<string | null> {
  const target = await resolvePublicTarget(rawUrl)

  const agent = createPinnedAgent(target.address, target.family)

  try {
    const requestInit = {
      ...init,
      redirect: "manual",
      dispatcher: agent,
    } as unknown as RequestInit

    const response = await fetch(target.url.toString(), requestInit)
    const location = response.headers.get("location")
    await response.body?.cancel().catch(() => undefined)

    if (!location) return null
    const resolved = new URL(location, target.url).toString()
    await resolvePublicTarget(resolved)
    return resolved
  } finally {
    void agent.close()
  }
}
