/**
 * 资产目标解析器（WP-2.2）。
 *
 * 根据项目 ID、资产种类和权限配置，决定资产应落地到哪个飞书目录/表格。
 * 模型不决定目标，由此模块确定性解析。
 *
 * 规则：
 * - 从环境变量读取配置（LARK_ASSET_ROOT_FOLDER_TOKEN 等）
 * - 项目无目标目录 → 返回失败 → 人工接管
 * - 不猜测任何 token，缺失配置即 fail-closed
 */
import type { FeishuAssetKind, PermissionProfile } from "@/lib/aim/artifacts/contracts"

// ─── 类型 ────────────────────────────────────────────────────────────────────

/** 解析后的资产目标。 */
export type ArtifactDestination =
  | { ok: true; folderToken: string; tableId?: string; baseToken?: string }
  | { ok: false; reason: "no_destination" | "missing_config"; detail: string }

/** 目标解析所需的环境配置。 */
export interface DestinationEnvConfig {
  /** 资产根目录 folder token。 */
  assetRootFolderToken?: string
  /** Base token（经营事项所在 Base）。 */
  baseToken?: string
  /** 内容日历表 ID。 */
  contentTableId?: string
  /** 竞品分析表 ID。 */
  competitorTableId?: string
  /** 交付任务表 ID。 */
  deliveryTableId?: string
  /** 默认编辑者 open_id。 */
  defaultEditorOpenId?: string
}

// ─── 核心函数 ────────────────────────────────────────────────────────────────

/**
 * 解析资产落地目标。
 *
 * @param kind - 资产种类
 * @param projectId - 项目 ID
 * @param permissionProfile - 权限配置
 * @param config - 环境配置
 * @returns 解析结果
 */
export function resolveArtifactDestination(
  kind: FeishuAssetKind,
  projectId: string,
  permissionProfile: PermissionProfile,
  config: DestinationEnvConfig,
): ArtifactDestination {
  // 根目录必须存在
  const rootFolder = config.assetRootFolderToken?.trim()
  if (!rootFolder) {
    return {
      ok: false,
      reason: "missing_config",
      detail: "缺少 LARK_ASSET_ROOT_FOLDER_TOKEN，无法确定资产根目录",
    }
  }

  switch (kind) {
    case "feishu_doc":
      return resolveDocDestination(rootFolder, projectId, permissionProfile)

    case "feishu_base_records":
      return resolveBaseDestination(config, projectId)

    case "feishu_sheet":
      return resolveSheetDestination(rootFolder, projectId)

    case "feishu_drive_file":
      return resolveDriveDestination(rootFolder, projectId)

    default:
      // 未知资产类型 fail-closed
      return {
        ok: false,
        reason: "no_destination",
        detail: `未知资产类型：${kind as string}，fail-closed`,
      }
  }
}

// ─── 各类型目标解析 ──────────────────────────────────────────────────────────

function resolveDocDestination(
  rootFolder: string,
  projectId: string,
  _permissionProfile: PermissionProfile,
): ArtifactDestination {
  // MVP：所有 Doc 落到资产根目录
  // 后续可按 projectId 或 permissionProfile 分子目录
  return { ok: true, folderToken: rootFolder }
}

function resolveBaseDestination(
  config: DestinationEnvConfig,
  _projectId: string,
): ArtifactDestination {
  const baseToken = config.baseToken?.trim()
  if (!baseToken) {
    return {
      ok: false,
      reason: "missing_config",
      detail: "缺少 LARK_BASE_TOKEN，无法写入 Base 记录",
    }
  }

  // 默认使用内容日历表，后续可按业务场景路由到不同表
  const tableId = config.contentTableId?.trim()
  if (!tableId) {
    return {
      ok: false,
      reason: "missing_config",
      detail: "缺少 LARK_CONTENT_TABLE_ID，无法确定目标表",
    }
  }

  return { ok: true, folderToken: "", baseToken, tableId }
}

function resolveSheetDestination(
  rootFolder: string,
  _projectId: string,
): ArtifactDestination {
  // Sheets 创建到资产根目录
  return { ok: true, folderToken: rootFolder }
}

function resolveDriveDestination(
  rootFolder: string,
  _projectId: string,
): ArtifactDestination {
  // Drive 文件上传到资产根目录
  return { ok: true, folderToken: rootFolder }
}

// ─── 配置读取辅助 ────────────────────────────────────────────────────────────

/**
 * 从环境变量读取目标解析配置。
 */
export function readDestinationConfig(
  env: Record<string, string | undefined> = process.env,
): DestinationEnvConfig {
  return {
    assetRootFolderToken: env.LARK_ASSET_ROOT_FOLDER_TOKEN?.trim() || undefined,
    baseToken: env.LARK_BASE_TOKEN?.trim() || undefined,
    contentTableId: env.LARK_CONTENT_TABLE_ID?.trim() || undefined,
    competitorTableId: env.LARK_COMPETITOR_TABLE_ID?.trim() || undefined,
    deliveryTableId: env.LARK_DELIVERY_TABLE_ID?.trim() || undefined,
    defaultEditorOpenId: env.LARK_ASSET_DEFAULT_EDITOR_OPEN_ID?.trim() || undefined,
  }
}
