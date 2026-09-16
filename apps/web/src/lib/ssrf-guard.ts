/**
 * SSRF 出站守卫 —— 纯函数层（客户端安全，无 node:* 依赖）。
 *
 * 只做「IP 字面量分类」：判断一个 IP 是否公网可路由。真正的 DNS 解析与钉 IP 连接
 * 在 `ssrf-guard.server.ts`（依赖 node:dns / undici），二者合起来构成
 * 「单一共享校验源」，供抖音短链 sink 与 URL 入口校验复用。
 *
 * 之所以拆两层：本模块会被客户端图静态引用（platform-post-id → hooks），
 * 若在此引入 node:dns 会污染前端打包。
 */

export class SsrfBlockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "SsrfBlockedError"
  }
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

/** 十进制/八进制/十六进制 IPv4 在 `new URL()` 解析期已被归一化为点分四段，故此处只认点分形式。 */
function ipv4ToInt(ip: string): number | null {
  const match = IPV4_PATTERN.exec(ip)
  if (!match) return null
  const octets = match.slice(1, 5).map(Number)
  if (octets.some((value) => value > 255)) return null
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3]
}

function inIpv4Range(value: number, base: string, bits: number): boolean {
  const baseValue = ipv4ToInt(base)
  if (baseValue === null) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (value & mask) === (baseValue & mask)
}

const BLOCKED_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8], // 本网络
  ["10.0.0.0", 8], // 私有
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // 回环
  ["169.254.0.0", 16], // 链路本地 + 云元数据 169.254.169.254
  ["172.16.0.0", 12], // 私有
  ["192.0.0.0", 24], // IETF 协议分配
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16], // 私有
  ["198.18.0.0", 15], // 基准测试
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // 组播
  ["240.0.0.0", 4], // 保留（含 255.255.255.255）
]

/** IPv4 字面量是否公网可路由；非 IPv4 字面量返回 null（以便与「域名」区分）。 */
export function classifyIpv4(ip: string): boolean | null {
  const value = ipv4ToInt(ip)
  if (value === null) return null
  return !BLOCKED_IPV4_RANGES.some(([base, bits]) => inIpv4Range(value, base, bits))
}

/**
 * 把 IPv6 尾部的点分 IPv4 段展开成两个十六进制组：`::ffff:169.254.169.254` → `::ffff:a9fe:a9fe`。
 *
 * RFC 4291 允许 IPv6 末 32 位用点分十进制书写，而 AWS/GCP 元数据地址 `169.254.169.254`
 * 的 IPv4-mapped 形式正是这样出现在实际解析结果里的。缺了这一步，该类地址会被判成
 * 「非 IP 字面量」而绕过全部 IP 校验 —— 属于 fail-open，必须堵。
 */
function expandEmbeddedIpv4(host: string): string {
  const lastColon = host.lastIndexOf(":")
  if (lastColon < 0) return host
  const tail = host.slice(lastColon + 1)
  const match = IPV4_PATTERN.exec(tail)
  if (!match) return host
  const octets = match.slice(1, 5).map(Number)
  if (octets.some((value) => value > 255)) return host
  const high = ((octets[0] << 8) | octets[1]).toString(16)
  const low = ((octets[2] << 8) | octets[3]).toString(16)
  return `${host.slice(0, lastColon + 1)}${high}:${low}`
}

/** 把 IPv6 字面量解析成 16 字节；非 IPv6 返回 null。支持 `::` 压缩、IPv4 内嵌、zone id。 */
function ipv6ToBytes(input: string): Uint8Array | null {
  let host = input.replace(/^\[|\]$/g, "").toLowerCase()
  const zoneIndex = host.indexOf("%")
  if (zoneIndex >= 0) host = host.slice(0, zoneIndex)
  if (!host.includes(":")) return null
  host = expandEmbeddedIpv4(host)

  const parseGroups = (segment: string): number[] | null => {
    if (!segment) return []
    const out: number[] = []
    for (const group of segment.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null
      out.push(parseInt(group, 16))
    }
    return out
  }

  const halves = host.split("::")
  if (halves.length > 2) return null
  let groups: number[]
  if (halves.length === 2) {
    const head = parseGroups(halves[0])
    const tail = parseGroups(halves[1])
    if (!head || !tail) return null
    const fill = 8 - (head.length + tail.length)
    if (fill < 1) return null
    groups = [...head, ...Array<number>(fill).fill(0), ...tail]
  } else {
    const all = parseGroups(halves[0])
    if (!all || all.length !== 8) return null
    groups = all
  }

  const bytes = new Uint8Array(16)
  groups.forEach((group, index) => {
    bytes[index * 2] = (group >> 8) & 0xff
    bytes[index * 2 + 1] = group & 0xff
  })
  return bytes
}

/** IPv6 字面量是否公网可路由；非 IPv6 字面量返回 null。IPv4-mapped/兼容地址按内嵌 IPv4 判定。 */
export function classifyIpv6(ip: string): boolean | null {
  const bytes = ipv6ToBytes(ip)
  if (!bytes) return null
  if (bytes.every((value) => value === 0)) return false // ::
  if (bytes.slice(0, 15).every((value) => value === 0) && bytes[15] === 1) return false // ::1
  const embeddedIpv4 = () => `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`
  // ::ffff:0:0/96 IPv4-mapped
  if (bytes.slice(0, 10).every((value) => value === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return classifyIpv4(embeddedIpv4()) ?? false
  }
  // ::/96 IPv4-compatible（已废弃，仍按内嵌 IPv4 判定）
  if (bytes.slice(0, 12).every((value) => value === 0)) {
    return classifyIpv4(embeddedIpv4()) ?? false
  }
  if ((bytes[0] & 0xfe) === 0xfc) return false // fc00::/7 ULA
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false // fe80::/10 链路本地
  if (bytes[0] === 0xff) return false // ff00::/8 组播
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return false // 2001:db8::/32 文档
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return false // 64:ff9b::/96 NAT64
  return true
}

/** 字符串形式的 IP 是否公网可路由；非 IP 字面量返回 false。 */
export function isPublicIp(ip: string): boolean {
  const ipv4 = classifyIpv4(ip)
  if (ipv4 !== null) return ipv4
  return classifyIpv6(ip) ?? false
}

/** 主机名是否为 IP 字面量（含 IPv6 方括号）。用于把「IP 直接判定」与「域名待解析」分开。 */
export function isIpLiteral(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "")
  if (classifyIpv4(host) !== null) return true
  return classifyIpv6(host) !== null
}
