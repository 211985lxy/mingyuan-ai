/**
 * 统一产出物契约（WP-2.1）。
 *
 * 定义 AIM 生成结果到飞书资产的映射契约：
 * - AimArtifactSpec：描述一个待落地的资产
 * - FeishuAssetReceipt：资产落地后的回执
 * - ArtifactLandingResult：落地编排的统一返回
 *
 * 核心规则：
 * - 模型只负责生成内容，不决定写到哪个飞书 token
 * - destination-resolver 根据项目和资产类型选择目录/表格
 * - MVP 将 Receipt 写入现有 AimGeneration.taskSpec 和 Trace
 * - 暂不新增数据库资产表
 */

// ─── 资产类型 ────────────────────────────────────────────────────────────────

/** 飞书资产种类。 */
export type FeishuAssetKind =
  | "feishu_doc"
  | "feishu_base_records"
  | "feishu_sheet"
  | "feishu_drive_file"

/** 资产角色：主要资产失败则经营事项失败，次要资产失败只标注缺失。 */
export type ArtifactRole = "primary" | "secondary"

/** 权限配置档案。 */
export type PermissionProfile =
  | "internal"        // 仅内部团队可见
  | "project_team"    // 项目组可见
  | "client_delivery" // 客户可见

// ─── 核心契约 ────────────────────────────────────────────────────────────────

/**
 * 待落地的资产规格说明。
 * 由 artifact mapper 从 AIM 生成结果确定性映射而来。
 */
export interface AimArtifactSpec {
  /** 资产唯一键（幂等标识，如 "meeting_insight:{recordId}:doc"）。 */
  artifactKey: string
  /** 本次生成的唯一 ID（AimGeneration.id）。 */
  generationId: string
  /** 关联的经营事项飞书记录 ID。 */
  workItemRecordId: string
  /** 所属项目 ID。 */
  projectId: string
  /** 资产种类。 */
  kind: FeishuAssetKind
  /** 资产角色。 */
  role: ArtifactRole
  /** 资产标题（用于飞书文档/表格标题）。 */
  title: string
  /** 是否为必需资产（必需资产失败则整体失败）。 */
  required: boolean
  /** 权限配置档案。 */
  permissionProfile: PermissionProfile
  /** 资产内容载荷（由具体 mapper 定义结构）。 */
  payload: unknown
}

/**
 * 飞书资产落地回执。
 * 创建成功后由 publisher 返回，写入 AimGeneration.taskSpec.artifacts。
 */
export interface FeishuAssetReceipt {
  /** 对应的资产键。 */
  artifactKey: string
  /** 飞书资产 token（doc token / record ID / sheet token / file token）。 */
  token: string
  /** 飞书资产 URL。 */
  url: string
  /** 资产种类。 */
  kind: FeishuAssetKind
  /** 内容哈希（用于幂等去重）。 */
  contentHash: string
  /** 版本号（首次创建为 1，更新递增）。 */
  version: number
  /** 是否为本次新创建（false 表示复用已有资产）。 */
  created: boolean
}

// ─── 落地结果 ────────────────────────────────────────────────────────────────

/** 落地失败阶段。 */
export type LandingFailurePhase =
  | "destination"  // 目标解析失败（无目录/表格）
  | "create"       // 资产创建失败
  | "permission"   // 权限设置失败
  | "verify"       // 回读验证失败
  | "writeback"    // 回写经营事项失败

/** 资产落地编排的统一返回。 */
export type ArtifactLandingResult =
  | { ok: true; receipts: FeishuAssetReceipt[]; primaryUrl: string }
  | { ok: false; error: string; phase: LandingFailurePhase; partialReceipts: FeishuAssetReceipt[] }

// ─── 功能开关 ────────────────────────────────────────────────────────────────

/** 资产落地功能配置。 */
export interface AssetLandingConfig {
  /** 总开关。 */
  enabled: boolean
  /** Shadow Mode：只记日志不真实创建。 */
  shadowMode: boolean
  /** 灰度项目 ID 列表（空 = 全部项目）。 */
  pilotProjectIds: string[]
}

/**
 * 判断指定项目是否启用资产落地。
 */
export function isAssetLandingEnabledForProject(
  config: AssetLandingConfig,
  projectId: string,
): boolean {
  if (!config.enabled) return false
  if (config.pilotProjectIds.length === 0) return true
  return config.pilotProjectIds.includes(projectId)
}

// ─── 内容哈希 ────────────────────────────────────────────────────────────────

/**
 * 计算内容哈希（用于幂等去重）。
 * 使用简单的字符串哈希，生产环境可替换为 crypto.createHash。
 */
export function computeContentHash(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return `h${(hash >>> 0).toString(36)}`
}

// ─── 资产键构造辅助 ──────────────────────────────────────────────────────────

/**
 * 构造标准资产键。
 * 格式：{kind}:{workItemRecordId}:{suffix}
 */
export function buildArtifactKey(
  kind: FeishuAssetKind,
  workItemRecordId: string,
  suffix = "primary",
): string {
  return `${kind}:${workItemRecordId}:${suffix}`
}
