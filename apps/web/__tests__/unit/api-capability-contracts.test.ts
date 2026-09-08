import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  CAPABILITY_CONTRACTS,
  getCapabilityContract,
  parseCapabilityInput,
} from "@/lib/api/contracts"

/**
 * Step② 能力 API 契约收敛单测：
 * - 注册表自洽（route 唯一、schema 可解析合法样本）
 * - zod 拒错（非法输入必须抛 ApiRequestError）
 * - 未登记路由拒绝服务
 * - inventory 文档层含 domain/kind/orchestratable 字段（与运行时两层契约对齐）
 */

const VALID_SAMPLES: Record<string, unknown> = {
  "/api/brief/ai-fill": { templateId: "tpl-1", userInput: "供暖改造" },
  "/api/admin/knowledge/distill": { ids: ["e1", "e2"] },
  "/api/competitor/search-channels/analyze": { keyword: "供暖改造", count: 20 },
  "/api/competitor-analysis/methodology/compile": {
    competitorAnalysisText: "竞品分析正文",
    projectName: "我的项目",
  },
}

const INVALID_SAMPLES: Record<string, Array<Record<string, unknown>>> = {
  "/api/brief/ai-fill": [{ userInput: "缺少 templateId" }, { templateId: "" }, { templateId: "t", extra: 1 }],
  "/api/admin/knowledge/distill": [{ ids: [] }, { ids: [] as string[] }, { ids: "not-array" as unknown as string[] }],
  "/api/competitor/search-channels/analyze": [
    { keyword: "" },
    { keyword: "ok", count: 4 },
    { keyword: "ok", count: 51 },
  ],
  "/api/competitor-analysis/methodology/compile": [{ projectName: "缺少正文" }],
}

function jsonRequest(route: string, body: unknown): Request {
  return new Request(`http://localhost${route}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("能力 API 契约注册表", () => {
  it("route 唯一且每条契约有合法样本可通过校验", () => {
    const routes = CAPABILITY_CONTRACTS.map((c) => c.route)
    expect(new Set(routes).size).toBe(routes.length)
    for (const contract of CAPABILITY_CONTRACTS) {
      const sample = VALID_SAMPLES[contract.route]
      expect(sample, `${contract.route} 缺少合法样本`).toBeDefined()
      expect(contract.inputSchema.parse(sample), `${contract.route} 合法样本应通过`).toBeDefined()
      expect(contract.orchestratable).toBe(!contract.route.startsWith("/api/admin/"))
    }
  })

  it("非法输入被 zod 拒绝（拒错单测）", async () => {
    for (const contract of CAPABILITY_CONTRACTS) {
      const invalidList = INVALID_SAMPLES[contract.route] ?? []
      for (const invalid of invalidList) {
        await expect(
          parseCapabilityInput(contract.route, jsonRequest(contract.route, invalid)),
        ).rejects.toThrow()
      }
    }
  })

  it("未登记路由返回 CAPABILITY_NOT_REGISTERED", async () => {
    const error = await parseCapabilityInput(
      "/api/not/registered",
      jsonRequest("/api/not/registered", {}),
    ).catch((e: unknown) => e as { code?: string })
    expect((error as { code?: string }).code).toBe("CAPABILITY_NOT_REGISTERED")
    expect(getCapabilityContract("/api/not/registered")).toBeUndefined()
  })

  it("inventory 文档层含 domain/kind/orchestratable（两层契约对齐）", () => {
    const inventoryPath = resolve(__dirname, "../../../../docs/architecture/api-inventory.json")
    const doc = JSON.parse(readFileSync(inventoryPath, "utf8")) as {
      routes: Array<{ route: string; domain: string; kind: string; orchestratable: boolean }>
    }
    expect(doc.routes.length).toBeGreaterThan(0)
    for (const entry of doc.routes) {
      expect(entry.domain.length, `${entry.route} 缺 domain`).toBeGreaterThan(0)
      expect(["capability", "management", "crud"], `${entry.route} kind 非法`).toContain(entry.kind)
      expect(typeof entry.orchestratable).toBe("boolean")
    }
    // 运行时注册的契约必须在文档层登记为 capability
    for (const contract of CAPABILITY_CONTRACTS) {
      const entry = doc.routes.find((r) => r.route === contract.route)
      expect(entry, `${contract.route} 未出现在 inventory`).toBeDefined()
      expect(entry?.kind).toBe("capability")
      expect(entry?.orchestratable).toBe(contract.orchestratable)
    }
  })
})
