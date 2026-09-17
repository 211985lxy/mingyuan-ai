import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, it } from "vitest"

import { AGENT_ROUTES } from "@/lib/llm/agent-router"

/**
 * 发布体检脚本与质量链的一致性守卫。
 *
 * 背景：scripts/probe-ecs-model-routes.sh 的头注释自己写着「跳表须与 agent-router.ts 的
 * QUALITY_PRIMARY_ROUTE 保持同步」，但没有任何机制强制它。2026-09-15 发现它已经漂了两处
 * （探 deepseek-v4-pro 而质量链用 deepseek-v4-flash、跳序把 doubao 排在第 2 而质量链里
 * doubao 是末跳），于是那道"发布前拦住死跳"的门禁实际上在探一条不存在的线路——
 * 它警告过的「本地 probe 假绿、生产 ModelNotOpen 让死跳烧掉重试预算」正是这样复发的。
 *
 * 这个测试把"保持同步"从注释变成断言。
 */

const PROBE_PATH = resolve(process.cwd(), "../../scripts/probe-ecs-model-routes.sh")

type ProbeHop = {
  provider: string
  position: number
  total: number
  model?: string
}

function readProbeHops(): ProbeHop[] {
  const source = readFileSync(PROBE_PATH, "utf8")

  const modelVars = new Map<string, string>()
  for (const match of source.matchAll(/^([A-Z_]+_MODEL_ID)="([^"]+)"/gm)) {
    modelVars.set(match[1], match[2])
  }

  return [...source.matchAll(/^probe_hop\s+(\S+)\s+"\$([A-Z_]+_MODEL_ID)"[^\n]*?\s(\d+)\s+(\d+)\s*$/gm)]
    .map((match) => ({
      provider: match[1],
      model: modelVars.get(match[2]),
      position: Number(match[3]),
      total: Number(match[4]),
    }))
    .sort((a, b) => a.position - b.position)
}

describe("发布体检脚本与质量链同步", () => {
  const route = AGENT_ROUTES.content_producer
  const hops = readProbeHops()

  it("解析到了完整的跳表", () => {
    // 解析失败会让下面的断言全部假绿，所以先确认拿到了线路本身。
    expect(hops.length).toBe(route.length)
    expect(hops.map((hop) => hop.position)).toEqual(hops.map((_, index) => index + 1))
    expect(hops.every((hop) => hop.total === hops.length)).toBe(true)
  })

  it("探测的跳序与质量链一致", () => {
    expect(hops.map((hop) => hop.provider)).toEqual(route.map((item) => item.name))
  })

  it.each(hops.map((hop) => [hop.provider, hop] as const))(
    "探的 %s 模型与质量链一致",
    (provider, hop) => {
      const expected = route.find((item) => item.name === provider)?.model
      expect(expected, `质量链里没有 ${provider}，体检脚本却在探它`).toBeTruthy()
      expect(hop.model, `${provider} 探测的模型与质量链不一致`).toBe(expected)
    },
  )
})
