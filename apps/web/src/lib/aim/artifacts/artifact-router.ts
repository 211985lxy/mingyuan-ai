/**
 * 资产路由器（WP-2.3 / WP-5）。
 *
 * 接收 AimArtifactSpec[]，按 kind 分发到对应 publisher。
 * - 幂等：相同 artifactKey + contentHash 不重复创建
 * - 未知 kind → fail-closed
 * - MVP：Receipt 写入 AimGeneration.taskSpec.artifacts 和 Trace
 * - WP-5：Drive 文件落地 + 多资产交付封面 Doc
 */
import type {
  AimArtifactSpec,
  FeishuAssetReceipt,
  ArtifactLandingResult,
} from "@/lib/aim/artifacts/contracts"
import { computeContentHash } from "@/lib/aim/artifacts/contracts"
import { resolveArtifactDestination, type DestinationEnvConfig } from "@/lib/aim/artifacts/destination-resolver"
import { createFeishuDoc, fetchFeishuDoc } from "@/lib/integrations/feishu-doc-publisher"
import { upsertBaseRecord } from "@/lib/integrations/feishu-base-publisher"
import { createFeishuSheet, writeFeishuSheet } from "@/lib/integrations/feishu-sheet-publisher"
import { uploadToDrive, findExistingByHash } from "@/lib/integrations/feishu-drive-publisher"
import { addFeishuPermission } from "@/lib/integrations/feishu-permission-service"
import type { LarkCliRunner } from "@/lib/integrations/lark-cli-runner"

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface ArtifactRouterOptions {
  /** 目标解析配置。 */
  destinationConfig: DestinationEnvConfig
  /** 默认编辑者 open_id（权限授予对象）。 */
  defaultEditorOpenId?: string
  /** CLI runner（测试注入）。 */
  runner?: LarkCliRunner
  /** CLI 路径。 */
  cliPath?: string
  /** 已有 Receipt（幂等检查用）。 */
  existingReceipts?: FeishuAssetReceipt[]
}

// ─── 核心路由 ────────────────────────────────────────────────────────────────

/**
 * 路由并落地一组资产。
 * 按角色排序：primary 先于 secondary。
 * primary 失败则整体失败；secondary 失败只标注缺失。
 */
export async function routeAndLandArtifacts(
  specs: AimArtifactSpec[],
  options: ArtifactRouterOptions,
): Promise<ArtifactLandingResult> {
  const receipts: FeishuAssetReceipt[] = []
  const existingMap = new Map(
    (options.existingReceipts ?? []).map((r) => [`${r.artifactKey}:${r.contentHash}`, r]),
  )

  // 按角色排序：primary 优先
  const sorted = [...specs].sort((a, b) => {
    if (a.role === "primary" && b.role !== "primary") return -1
    if (a.role !== "primary" && b.role === "primary") return 1
    return 0
  })

  for (const spec of sorted) {
    const contentHash = computeContentHash(JSON.stringify(spec.payload))

    // 幂等检查
    const idempotencyKey = `${spec.artifactKey}:${contentHash}`
    const existing = existingMap.get(idempotencyKey)
    if (existing) {
      receipts.push({ ...existing, created: false })
      continue
    }

    // 解析目标
    const destination = resolveArtifactDestination(
      spec.kind,
      spec.projectId,
      spec.permissionProfile,
      options.destinationConfig,
    )

    if (!destination.ok) {
      if (spec.role === "primary") {
        return {
          ok: false,
          error: `主要资产目标解析失败：${destination.detail}`,
          phase: "destination",
          partialReceipts: receipts,
        }
      }
      // 次要资产目标缺失，跳过并继续
      continue
    }

    // 按 kind 分发
    try {
      const receipt = await landSingleArtifact(spec, contentHash, destination, options)
      receipts.push(receipt)
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      if (spec.role === "primary") {
        return {
          ok: false,
          error: `主要资产创建失败（${spec.kind}）：${error}`,
          phase: "create",
          partialReceipts: receipts,
        }
      }
      // 次要资产失败，继续
    }
  }

  // 找到 primary 资产的 URL
  const primarySpec = specs.find((s) => s.role === "primary")
  const primaryReceipt = primarySpec
    ? receipts.find((r) => r.artifactKey === primarySpec.artifactKey)
    : undefined
  const primaryUrl = primaryReceipt?.url ?? ""

  return { ok: true, receipts, primaryUrl }
}

// ─── 单资产落地 ──────────────────────────────────────────────────────────────

async function landSingleArtifact(
  spec: AimArtifactSpec,
  contentHash: string,
  destination: Extract<ReturnType<typeof resolveArtifactDestination>, { ok: true }>,
  options: ArtifactRouterOptions,
): Promise<FeishuAssetReceipt> {
  switch (spec.kind) {
    case "feishu_doc":
      return landDocArtifact(spec, contentHash, destination.folderToken, options)

    case "feishu_base_records":
      return landBaseArtifact(spec, contentHash, destination, options)

    case "feishu_sheet":
      return landSheetArtifact(spec, contentHash, destination.folderToken, options)

    case "feishu_drive_file":
      return landDriveArtifact(spec, contentHash, destination.folderToken, options)

    default:
      throw new Error(`未知资产类型：${spec.kind as string}，fail-closed`)
  }
}

async function landDocArtifact(
  spec: AimArtifactSpec,
  contentHash: string,
  folderToken: string,
  options: ArtifactRouterOptions,
): Promise<FeishuAssetReceipt> {
  const payload = spec.payload as { markdown: string }
  const markdown = payload.markdown ?? String(spec.payload)

  // 创建文档
  const created = await createFeishuDoc({
    title: spec.title,
    content: markdown,
    folderToken,
    runner: options.runner,
    cliPath: options.cliPath,
  })

  // 设置权限
  if (options.defaultEditorOpenId) {
    await addFeishuPermission({
      token: created.token,
      type: "doc",
      memberId: options.defaultEditorOpenId,
      memberType: "openid",
      role: "edit",
      runner: options.runner,
      cliPath: options.cliPath,
    })
  }

  // 回读验证
  await fetchFeishuDoc({
    documentId: created.token,
    runner: options.runner,
    cliPath: options.cliPath,
  })

  return {
    artifactKey: spec.artifactKey,
    token: created.token,
    url: created.url,
    kind: "feishu_doc",
    contentHash,
    version: 1,
    created: true,
  }
}

async function landBaseArtifact(
  spec: AimArtifactSpec,
  contentHash: string,
  destination: { baseToken?: string; tableId?: string },
  options: ArtifactRouterOptions,
): Promise<FeishuAssetReceipt> {
  const payload = spec.payload as { fields: Record<string, unknown> }
  const baseToken = destination.baseToken
  const tableId = destination.tableId

  if (!baseToken || !tableId) {
    throw new Error("Base 目标配置不完整")
  }

  const result = await upsertBaseRecord({
    baseToken,
    tableId,
    fields: payload.fields,
    idempotencyField: "AIM资产键",
    idempotencyKey: spec.artifactKey,
    runner: options.runner,
    cliPath: options.cliPath,
  })

  return {
    artifactKey: spec.artifactKey,
    token: result.recordId,
    url: `https://feishu.cn/base/${baseToken}?table=${tableId}&record=${result.recordId}`,
    kind: "feishu_base_records",
    contentHash,
    version: 1,
    created: result.created,
  }
}

async function landSheetArtifact(
  spec: AimArtifactSpec,
  contentHash: string,
  folderToken: string,
  options: ArtifactRouterOptions,
): Promise<FeishuAssetReceipt> {
  const payload = spec.payload as { headers: string[]; rows: unknown[][] }

  // 创建表格
  const created = await createFeishuSheet({
    title: spec.title,
    folderToken,
    runner: options.runner,
    cliPath: options.cliPath,
  })

  // 写入表头和数据
  if (payload.headers?.length) {
    const allRows = [payload.headers, ...(payload.rows ?? [])]
    const endCol = String.fromCharCode(64 + Math.min(payload.headers.length, 26))
    await writeFeishuSheet({
      spreadsheetToken: created.token,
      sheetId: created.sheetId,
      range: `A1:${endCol}${allRows.length}`,
      values: allRows,
      runner: options.runner,
      cliPath: options.cliPath,
    })
  }

  return {
    artifactKey: spec.artifactKey,
    token: created.token,
    url: created.url,
    kind: "feishu_sheet",
    contentHash,
    version: 1,
    created: true,
  }
}

/**
 * Drive 文件落地（WP-5）。
 * 流程：幂等检查（同哈希不重复上传）→ 上传 → 权限 → Receipt。
 */
async function landDriveArtifact(
  spec: AimArtifactSpec,
  contentHash: string,
  folderToken: string,
  options: ArtifactRouterOptions,
): Promise<FeishuAssetReceipt> {
  const payload = spec.payload as { filePath: string; fileName: string }
  const filePath = payload.filePath
  const fileName = payload.fileName

  if (!filePath || !fileName) {
    throw new Error("Drive 文件资产缺少 filePath 或 fileName")
  }

  // 幂等：同文件名已存在则复用
  const existingFile = await findExistingByHash({
    folderToken,
    fileName,
    contentHash,
    runner: options.runner,
    cliPath: options.cliPath,
  })

  if (existingFile) {
    return {
      artifactKey: spec.artifactKey,
      token: existingFile.token,
      url: existingFile.url,
      kind: "feishu_drive_file",
      contentHash,
      version: 1,
      created: false,
    }
  }

  // 上传
  const uploaded = await uploadToDrive({
    filePath,
    folderToken,
    fileName,
    contentHash,
    runner: options.runner,
    cliPath: options.cliPath,
  })

  // 设置权限
  if (options.defaultEditorOpenId) {
    await addFeishuPermission({
      token: uploaded.token,
      type: "file",
      memberId: options.defaultEditorOpenId,
      memberType: "openid",
      role: "edit",
      runner: options.runner,
      cliPath: options.cliPath,
    })
  }

  return {
    artifactKey: spec.artifactKey,
    token: uploaded.token,
    url: uploaded.url,
    kind: "feishu_drive_file",
    contentHash,
    version: 1,
    created: true,
  }
}
