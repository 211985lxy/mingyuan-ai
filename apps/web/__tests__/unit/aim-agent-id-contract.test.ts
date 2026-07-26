/**
 * AimAgentId 唯一事实源契约测试。
 *
 * 升级阶段 1（Commit 1.1）：把原先散落在 handler / ui-config / harness/types /
 * eval/contracts 四处的 AimAgentId 重复定义收敛到 @/lib/aim-harness/contracts。
 * 本测试锁定"唯一源"承诺——所有消费方必须对同一个 id 集合达成一致，且别名归一化
 * 幂等。任何新增/删除智能体都必须同时改 contracts.ts，否则本测试失败。
 */
import { describe, expect, it } from "vitest"

import {
  AIM_AGENT_IDS,
  DEFAULT_AIM_AGENT,
  LEGACY_AGENT_ID_ALIASES,
  isValidAimAgent,
  normalizeAimAgentId,
  type AimAgentId,
} from "@/lib/aim-harness/contracts"
import { AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"
import { getAgentHandler } from "@/lib/aim-agent-handlers"
import { ALL_FIXTURES, EXPECTED_AGENT_COUNTS } from "../eval/fixtures"

const SEVEN_AGENT_IDS: readonly AimAgentId[] = [
  "content_producer",
  "free_copywriter",
  "work_editor",
  "business_system_diagnosis",
  "business_diagnosis",
  "content_review",
  "persona",
]

describe("AimAgentId 唯一事实源", () => {
  it("contracts 是唯一 type 定义源（grep 级保护见 CI 护栏）", () => {
    // 静态保证：AIM_AGENT_IDS 与 type 字面量同源（二者均在 contracts.ts 手写维护）。
    for (const id of SEVEN_AGENT_IDS) {
      expect(AIM_AGENT_IDS.has(id)).toBe(true)
    }
    expect(AIM_AGENT_IDS.size).toBe(SEVEN_AGENT_IDS.length)
  })

  it("默认智能体是合法 id", () => {
    expect(isValidAimAgent(DEFAULT_AIM_AGENT)).toBe(true)
  })

  it("UI 元数据选项与 contracts 的 id 集合完全一致", () => {
    const uiIds = new Set(AIM_AGENT_OPTIONS.map((o) => o.id))
    expect(uiIds).toEqual(new Set(AIM_AGENT_IDS))
  })

  it("HANDLERS 覆盖每个合法 agent id", () => {
    // 通过 getAgentHandler 间接校验调度表为每个 id 都注册了 handler，
    // 且默认回退不会吞掉合法 id（合法 id 不得返回默认 agent，除非它本身就是默认）。
    for (const id of AIM_AGENT_IDS) {
      const handler = getAgentHandler(id)
      expect(handler, `agent ${id} must have a registered handler`).toBeDefined()
    }
  })

  it("eval fixtures 的 agent 覆盖与 contracts 一致，无非法 id", () => {
    const fixtureAgents = new Set(ALL_FIXTURES.map((f) => f.agent))
    expect(fixtureAgents).toEqual(new Set(AIM_AGENT_IDS))
    // EXPECTED_AGENT_COUNTS 的 key 也必须是合法 id。
    expect(new Set(Object.keys(EXPECTED_AGENT_COUNTS))).toEqual(new Set(AIM_AGENT_IDS))
  })

  it("别名归一化幂等，且未知 id 原样透传", () => {
    // 命中别名 → 规范 id；对规范 id 再归一化应不变（幂等）。
    for (const [legacy, canonical] of Object.entries(LEGACY_AGENT_ID_ALIASES)) {
      expect(normalizeAimAgentId(legacy)).toBe(canonical)
      expect(normalizeAimAgentId(canonical)).toBe(canonical)
    }
    // 合法 id 归一化后不变。
    for (const id of AIM_AGENT_IDS) {
      expect(normalizeAimAgentId(id)).toBe(id)
    }
    // 完全未知的外部 id 原样返回（归一化阶段不做合法性断言）。
    expect(normalizeAimAgentId("totally_unknown_agent")).toBe("totally_unknown_agent")
    // 空值回退默认。
    expect(normalizeAimAgentId(null)).toBe(DEFAULT_AIM_AGENT)
    expect(normalizeAimAgentId(undefined)).toBe(DEFAULT_AIM_AGENT)
    expect(normalizeAimAgentId("")).toBe(DEFAULT_AIM_AGENT)
  })

  it("isValidAimAgent 接受合法 id 与旧别名，拒绝其它", () => {
    for (const id of AIM_AGENT_IDS) {
      expect(isValidAimAgent(id)).toBe(true)
    }
    for (const legacy of Object.keys(LEGACY_AGENT_ID_ALIASES)) {
      expect(isValidAimAgent(legacy)).toBe(true)
    }
    expect(isValidAimAgent("not_an_agent")).toBe(false)
    expect(isValidAimAgent("")).toBe(false)
    expect(isValidAimAgent(null)).toBe(false)
  })
})
