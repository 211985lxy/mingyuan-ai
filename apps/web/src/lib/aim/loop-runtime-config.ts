/**
 * Business Loop 运行时配置（含 supervised_auto 正式自动）。
 *
 * 正式自动条件（全部满足）：
 * - AIM_BUSINESS_LOOPS_ENABLED=true
 * - AIM_LOOP_SHADOW_MODE=false
 * - AIM_LOOP_OPERATING_MODE=supervised_auto|assisted|low_risk_auto
 * - AIM_LOOP_PILOT_PROJECT_IDS 非空
 *
 * supervised_auto：可写飞书经营事项并通知监督人，但仍要求人工终审；
 * 禁止自动对客户外发（allowExternalSideEffects 仍由 LoopSpec 约束为 false）。
 */

import { env } from "@/env"
import {
  LOOP_OPERATING_MODES,
  type LoopOperatingMode,
} from "@/lib/aim/loops/contracts"

type LoopRuntimeEnvironment = {
  AIM_BUSINESS_LOOPS_ENABLED?: string
  AIM_LOOP_SHADOW_MODE?: string
  AIM_LOOP_PILOT_PROJECT_IDS?: string
  AIM_LOOP_OPERATING_MODE?: string
}

export interface LoopRuntimeConfig {
  enabled: boolean
  /** true = 影子：零飞书写入 / 零通知 */
  shadowMode: boolean
  /**
   * 有效运行模式。shadowMode=true 时恒为 shadow；
   * 否则取 AIM_LOOP_OPERATING_MODE（默认 assisted）。
   */
  operatingMode: LoopOperatingMode
  pilotProjectIds: ReadonlySet<string>
}

function runtimeEnvironment(): LoopRuntimeEnvironment {
  return {
    AIM_BUSINESS_LOOPS_ENABLED: env.AIM_BUSINESS_LOOPS_ENABLED,
    AIM_LOOP_SHADOW_MODE: env.AIM_LOOP_SHADOW_MODE,
    AIM_LOOP_PILOT_PROJECT_IDS: env.AIM_LOOP_PILOT_PROJECT_IDS,
    AIM_LOOP_OPERATING_MODE: env.AIM_LOOP_OPERATING_MODE,
  }
}

function parseOperatingMode(raw: string | undefined): LoopOperatingMode {
  const value = raw?.trim().toLowerCase()
  if (!value) return "assisted"
  const matched = LOOP_OPERATING_MODES.find((mode) => mode === value)
  if (!matched) {
    throw new Error(
      `AIM_LOOP_OPERATING_MODE 无效：${raw}。允许值：${LOOP_OPERATING_MODES.join(", ")}`,
    )
  }
  return matched
}

/**
 * @description 读取业务循环运行时配置
 */
export function readLoopRuntimeConfig(
  source: LoopRuntimeEnvironment = runtimeEnvironment(),
): LoopRuntimeConfig {
  const enabled = source.AIM_BUSINESS_LOOPS_ENABLED?.trim().toLowerCase() === "true"
  const shadowMode = source.AIM_LOOP_SHADOW_MODE?.trim().toLowerCase() !== "false"
  const pilotProjectIds = new Set(
    (source.AIM_LOOP_PILOT_PROJECT_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  if (enabled && pilotProjectIds.size === 0) {
    throw new Error("Business Loop 已启用但未配置 AIM_LOOP_PILOT_PROJECT_IDS。")
  }

  const requestedMode = parseOperatingMode(source.AIM_LOOP_OPERATING_MODE)
  if (enabled && !shadowMode && requestedMode === "shadow") {
    throw new Error(
      "AIM_LOOP_SHADOW_MODE=false 时不能再把 AIM_LOOP_OPERATING_MODE 设为 shadow；请用 assisted / supervised_auto / low_risk_auto。",
    )
  }
  if (enabled && !shadowMode && requestedMode === "low_risk_auto") {
    // 当前销售 Loop 仍禁止外发副作用；low_risk_auto 暂不允许开启，避免误以为可自动外发。
    throw new Error(
      "low_risk_auto 尚未开放（外发副作用仍被 LoopSpec 禁止）。请使用 supervised_auto 或 assisted。",
    )
  }

  const operatingMode: LoopOperatingMode = !enabled || shadowMode ? "shadow" : requestedMode

  return { enabled, shadowMode, operatingMode, pilotProjectIds }
}

/**
 * @description supervised_auto / assisted 正式写入是否开启（非影子）
 */
export function isLoopLiveWriteEnabled(config: LoopRuntimeConfig = readLoopRuntimeConfig()): boolean {
  return config.enabled && !config.shadowMode && config.operatingMode !== "shadow"
}
