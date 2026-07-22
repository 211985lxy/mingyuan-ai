/**
 * 飞书资产落地编排（WP-2.4）。
 *
 * 编排完整的资产落地流程：
 *   功能开关检查 → 目标解析 → 创建资产 → 设置权限 → 回读验证 → Receipt → 回写经营事项
 *
 * 支持：
 * - 功能开关：AIM_FEISHU_ASSET_LANDING_ENABLED
 * - Shadow Mode：只记日志不真实创建
 * - 灰度：按项目 ID 控制
 */
import type {
  AimArtifactSpec,
  ArtifactLandingResult,
  AssetLandingConfig,
  FeishuAssetReceipt,
} from "@/lib/aim/artifacts/contracts"
import { isAssetLandingEnabledForProject } from "@/lib/aim/artifacts/contracts"
import { routeAndLandArtifacts } from "@/lib/aim/artifacts/artifact-router"
import { readDestinationConfig } from "@/lib/aim/artifacts/destination-resolver"
import type { LarkCliRunner } from "@/lib/integrations/lark-cli-runner"
import { logger } from "@/lib/logger"

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface AssetLandingOrchestratorOptions {
  /** 功能配置。 */
  config: AssetLandingConfig
  /** 默认编辑者 open_id。 */
  defaultEditorOpenId?: string
  /** CLI runner（测试注入）。 */
  runner?: LarkCliRunner
  /** CLI 路径。 */
  cliPath?: string
  /** 已有 Receipt（幂等检查用，从 taskSpec.artifacts 读取）。 */
  existingReceipts?: FeishuAssetReceipt[]
  /** 环境变量来源。 */
  env?: Record<string, string | undefined>
}

export interface AssetLandingSkipResult {
  ok: true
  skipped: true
  reason: "disabled" | "shadow_mode" | "not_pilot"
  primaryUrl: string
}

export type AssetLandingOutcome = ArtifactLandingResult | AssetLandingSkipResult

// ─── 核心编排 ────────────────────────────────────────────────────────────────

/**
 * 编排飞书资产落地。
 *
 * 返回：
 * - skipped：功能未启用或 Shadow Mode，调用方使用 AIM 内部结果链接
 * - ok：资产创建成功，primaryUrl 为飞书资产 URL
 * - !ok：资产创建失败，调用方按失败语义处理
 */
export async function orchestrateAssetLanding(
  specs: AimArtifactSpec[],
  projectId: string,
  options: AssetLandingOrchestratorOptions,
): Promise<AssetLandingOutcome> {
  const { config } = options

  // 1. 功能开关检查
  if (!config.enabled) {
    return { ok: true, skipped: true, reason: "disabled", primaryUrl: "" }
  }

  // 2. 灰度项目检查
  if (!isAssetLandingEnabledForProject(config, projectId)) {
    return { ok: true, skipped: true, reason: "not_pilot", primaryUrl: "" }
  }

  // 3. Shadow Mode：只记日志
  if (config.shadowMode) {
    logger.info(
      { projectId, specCount: specs.length, kinds: specs.map((s) => s.kind) },
      "[asset-landing] Shadow Mode：跳过真实创建",
    )
    return { ok: true, skipped: true, reason: "shadow_mode", primaryUrl: "" }
  }

  // 4. 真实落地
  const env = options.env ?? process.env
  const destinationConfig = readDestinationConfig(env)

  logger.info(
    { projectId, specCount: specs.length },
    "[asset-landing] 开始飞书资产落地",
  )

  const result = await routeAndLandArtifacts(specs, {
    destinationConfig,
    defaultEditorOpenId: options.defaultEditorOpenId ?? destinationConfig.defaultEditorOpenId,
    runner: options.runner,
    cliPath: options.cliPath,
    existingReceipts: options.existingReceipts,
  })

  if (result.ok) {
    logger.info(
      { projectId, receiptCount: result.receipts.length, primaryUrl: result.primaryUrl },
      "[asset-landing] 飞书资产落地成功",
    )
  } else {
    logger.error(
      { projectId, error: result.error, phase: result.phase },
      "[asset-landing] 飞书资产落地失败",
    )
  }

  return result
}

// ─── 配置读取 ────────────────────────────────────────────────────────────────

/**
 * 从环境变量读取资产落地配置。
 */
export function readAssetLandingConfig(
  env: Record<string, string | undefined> = process.env,
): AssetLandingConfig {
  const enabled = env.AIM_FEISHU_ASSET_LANDING_ENABLED?.trim().toLowerCase() === "true"
  const shadowMode = env.AIM_FEISHU_ASSET_SHADOW_MODE?.trim().toLowerCase() !== "false"
  const pilotRaw = env.AIM_FEISHU_ASSET_PILOT_PROJECT_IDS?.trim() ?? ""
  const pilotProjectIds = pilotRaw
    ? pilotRaw.split(",").map((id) => id.trim()).filter(Boolean)
    : []

  return { enabled, shadowMode, pilotProjectIds }
}

// ─── Receipt 持久化辅助 ──────────────────────────────────────────────────────

/**
 * 将 Receipt 合并到 taskSpec.artifacts（MVP 不新增表）。
 * 返回更新后的 taskSpec 对象。
 */
export function mergeReceiptsIntoTaskSpec(
  taskSpec: Record<string, unknown>,
  receipts: FeishuAssetReceipt[],
): Record<string, unknown> {
  const existing = Array.isArray(taskSpec.artifacts) ? taskSpec.artifacts as FeishuAssetReceipt[] : []
  const existingKeys = new Set(existing.map((r) => r.artifactKey))

  const merged = [...existing]
  for (const receipt of receipts) {
    if (existingKeys.has(receipt.artifactKey)) {
      // 更新已有
      const idx = merged.findIndex((r) => r.artifactKey === receipt.artifactKey)
      if (idx >= 0) merged[idx] = receipt
    } else {
      merged.push(receipt)
    }
  }

  return { ...taskSpec, artifacts: merged }
}
