/**
 * 钉 IP dispatcher 的**真实连接**回归 —— 本文件不 mock `fetch`，也不 mock `undici`。
 *
 * 背景：`.invalid` 是 RFC 2606 保留 TLD，DNS **永不解析**。因此把连接钉到本地
 * `127.0.0.1` 后，请求能否命中本地服务，只取决于「钉 IP 是否真的生效」：
 *   - 生效 → 不发 DNS 查询，直连本地 → 拿到 LOCAL_HIT
 *   - 失效 → 去解析 `.invalid` → ENOTFOUND → 用例失败
 *
 * 这条设计同时保证了**离线可跑**（不依赖外网）与**强判别力**（不靠 mock 自证）。
 *
 * 之所以必须用真实连接：历史上本套装的 `probeRedirect` 单测把 `undici` 与 `fetch`
 * 双双 mock 掉，于是「lookup 回调签名与 Node `autoSelectFamily` 不兼容」这个致命
 * 缺陷完全没被发现 —— 线上表现为抖音短链解析静默失效。
 */
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { Agent } from "undici"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createPinnedAgent } from "@/lib/ssrf-guard.server"

let server: Server
let port: number
const hits: string[] = []

beforeAll(async () => {
  server = createServer((req, res) => {
    hits.push(req.url ?? "")
    res.end("LOCAL_HIT")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

describe("createPinnedAgent —— 真实连接（不 mock）", () => {
  it("把域名连接钉到指定地址，绕过 DNS", async () => {
    const agent = createPinnedAgent("127.0.0.1", 4)
    try {
      const response = await fetch(`http://pinned-probe.invalid:${port}/pinned`, {
        dispatcher: agent,
      } as unknown as RequestInit)

      expect(response.status).toBe(200)
      expect(await response.text()).toBe("LOCAL_HIT")
      expect(hits).toContain("/pinned")
    } finally {
      await agent.close()
    }
  })

  it("多次请求复用同一 agent 仍走钉住地址", async () => {
    const agent = createPinnedAgent("127.0.0.1", 4)
    try {
      for (const path of ["/a", "/b"]) {
        const response = await fetch(`http://pinned-probe.invalid:${port}${path}`, {
          dispatcher: agent,
        } as unknown as RequestInit)
        expect(await response.text()).toBe("LOCAL_HIT")
      }
      expect(hits).toContain("/a")
      expect(hits).toContain("/b")
    } finally {
      await agent.close()
    }
  })

  it("对照：不兼容 autoSelectFamily(all) 的三参回法会直接失败（证明上两条有判别力）", async () => {
    // 这正是修复前的写法：Node 以 { all: true } 调用 lookup，三参回法触发
    // ERR_INVALID_IP_ADDRESS，请求直接失败（而不是退回未钉 IP）。
    const broken = new Agent({
      connect: {
        lookup: (_hostname, _options, callback) => {
          ;(callback as unknown as (e: null, a: string, f: number) => void)(null, "127.0.0.1", 4)
        },
      },
    })

    try {
      await expect(
        fetch(`http://pinned-probe.invalid:${port}/broken`, {
          dispatcher: broken,
        } as unknown as RequestInit),
      ).rejects.toThrow()

      // 关键：坏写法不会「兜底命中本地」，而是彻底失败
      expect(hits).not.toContain("/broken")
    } finally {
      await broken.close()
    }
  })
})
