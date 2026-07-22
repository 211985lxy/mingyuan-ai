import { describe, expect, it, vi } from "vitest"
import {
  buildArtifactKey,
  computeContentHash,
  isAssetLandingEnabledForProject,
  type AssetLandingConfig,
} from "@/lib/aim/artifacts/contracts"
import {
  readDestinationConfig,
  resolveArtifactDestination,
} from "@/lib/aim/artifacts/destination-resolver"
import {
  mergeReceiptsIntoTaskSpec,
  orchestrateAssetLanding,
  readAssetLandingConfig,
} from "@/lib/aim/artifacts/feishu-asset-landing"
import type { AimArtifactSpec, FeishuAssetReceipt } from "@/lib/aim/artifacts/contracts"

describe("artifacts/contracts", () => {
  it("computeContentHash 对相同内容返回相同哈希", () => {
    const hash1 = computeContentHash("hello world")
    const hash2 = computeContentHash("hello world")
    expect(hash1).toBe(hash2)
  })

  it("computeContentHash 对不同内容返回不同哈希", () => {
    const hash1 = computeContentHash("hello")
    const hash2 = computeContentHash("world")
    expect(hash1).not.toBe(hash2)
  })

  it("buildArtifactKey 构造标准格式", () => {
    const key = buildArtifactKey("feishu_doc", "rec_123")
    expect(key).toBe("feishu_doc:rec_123:primary")
  })

  it("buildArtifactKey 支持自定义后缀", () => {
    const key = buildArtifactKey("feishu_sheet", "rec_456", "matrix")
    expect(key).toBe("feishu_sheet:rec_456:matrix")
  })

  describe("isAssetLandingEnabledForProject", () => {
    it("功能关闭时返回 false", () => {
      const config: AssetLandingConfig = { enabled: false, shadowMode: true, pilotProjectIds: [] }
      expect(isAssetLandingEnabledForProject(config, "proj_1")).toBe(false)
    })

    it("功能开启且无灰度限制时返回 true", () => {
      const config: AssetLandingConfig = { enabled: true, shadowMode: false, pilotProjectIds: [] }
      expect(isAssetLandingEnabledForProject(config, "proj_1")).toBe(true)
    })

    it("灰度项目内返回 true", () => {
      const config: AssetLandingConfig = { enabled: true, shadowMode: false, pilotProjectIds: ["proj_1"] }
      expect(isAssetLandingEnabledForProject(config, "proj_1")).toBe(true)
    })

    it("灰度项目外返回 false", () => {
      const config: AssetLandingConfig = { enabled: true, shadowMode: false, pilotProjectIds: ["proj_1"] }
      expect(isAssetLandingEnabledForProject(config, "proj_2")).toBe(false)
    })
  })
})

describe("artifacts/destination-resolver", () => {
  it("缺少根目录时返回 missing_config", () => {
    const result = resolveArtifactDestination("feishu_doc", "proj_1", "internal", {})
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("missing_config")
    }
  })

  it("Doc 目标解析成功", () => {
    const config = { assetRootFolderToken: "folder_abc" }
    const result = resolveArtifactDestination("feishu_doc", "proj_1", "internal", config)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.folderToken).toBe("folder_abc")
    }
  })

  it("Base 目标缺少 baseToken 时失败", () => {
    const config = { assetRootFolderToken: "folder_abc" }
    const result = resolveArtifactDestination("feishu_base_records", "proj_1", "internal", config)
    expect(result.ok).toBe(false)
  })

  it("Base 目标解析成功", () => {
    const config = {
      assetRootFolderToken: "folder_abc",
      baseToken: "base_xyz",
      contentTableId: "tbl_123",
    }
    const result = resolveArtifactDestination("feishu_base_records", "proj_1", "internal", config)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.baseToken).toBe("base_xyz")
      expect(result.tableId).toBe("tbl_123")
    }
  })

  it("未知资产类型 fail-closed", () => {
    const config = { assetRootFolderToken: "folder_abc" }
    const result = resolveArtifactDestination("unknown" as never, "proj_1", "internal", config)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe("no_destination")
    }
  })

  it("readDestinationConfig 从环境变量读取", () => {
    const env = {
      LARK_ASSET_ROOT_FOLDER_TOKEN: "folder_test",
      LARK_BASE_TOKEN: "base_test",
      LARK_CONTENT_TABLE_ID: "tbl_test",
    }
    const config = readDestinationConfig(env)
    expect(config.assetRootFolderToken).toBe("folder_test")
    expect(config.baseToken).toBe("base_test")
    expect(config.contentTableId).toBe("tbl_test")
  })
})

describe("artifacts/feishu-asset-landing", () => {
  it("功能关闭时跳过", async () => {
    const result = await orchestrateAssetLanding([], "proj_1", {
      config: { enabled: false, shadowMode: true, pilotProjectIds: [] },
    })
    expect(result.ok).toBe(true)
    if ("skipped" in result) {
      expect(result.skipped).toBe(true)
      expect(result.reason).toBe("disabled")
    }
  })

  it("Shadow Mode 时跳过", async () => {
    const result = await orchestrateAssetLanding([], "proj_1", {
      config: { enabled: true, shadowMode: true, pilotProjectIds: [] },
    })
    expect(result.ok).toBe(true)
    if ("skipped" in result) {
      expect(result.skipped).toBe(true)
      expect(result.reason).toBe("shadow_mode")
    }
  })

  it("非灰度项目时跳过", async () => {
    const result = await orchestrateAssetLanding([], "proj_2", {
      config: { enabled: true, shadowMode: false, pilotProjectIds: ["proj_1"] },
    })
    expect(result.ok).toBe(true)
    if ("skipped" in result) {
      expect(result.skipped).toBe(true)
      expect(result.reason).toBe("not_pilot")
    }
  })

  it("readAssetLandingConfig 正确解析环境变量", () => {
    const env = {
      AIM_FEISHU_ASSET_LANDING_ENABLED: "true",
      AIM_FEISHU_ASSET_SHADOW_MODE: "false",
      AIM_FEISHU_ASSET_PILOT_PROJECT_IDS: "proj_1, proj_2",
    }
    const config = readAssetLandingConfig(env)
    expect(config.enabled).toBe(true)
    expect(config.shadowMode).toBe(false)
    expect(config.pilotProjectIds).toEqual(["proj_1", "proj_2"])
  })

  it("readAssetLandingConfig 默认 shadow mode 为 true", () => {
    const config = readAssetLandingConfig({ AIM_FEISHU_ASSET_LANDING_ENABLED: "true" })
    expect(config.shadowMode).toBe(true)
  })

  describe("mergeReceiptsIntoTaskSpec", () => {
    it("合并新 Receipt", () => {
      const taskSpec = { kind: "meeting_insight" }
      const receipts: FeishuAssetReceipt[] = [{
        artifactKey: "doc:rec_1:primary",
        token: "doc_token",
        url: "https://feishu.cn/docx/doc_token",
        kind: "feishu_doc",
        contentHash: "h123",
        version: 1,
        created: true,
      }]
      const merged = mergeReceiptsIntoTaskSpec(taskSpec, receipts)
      expect(merged.kind).toBe("meeting_insight")
      expect(merged.artifacts).toHaveLength(1)
    })

    it("更新已有 Receipt", () => {
      const taskSpec = {
        artifacts: [{
          artifactKey: "doc:rec_1:primary",
          token: "old_token",
          url: "old_url",
          kind: "feishu_doc",
          contentHash: "h_old",
          version: 1,
          created: true,
        }],
      }
      const receipts: FeishuAssetReceipt[] = [{
        artifactKey: "doc:rec_1:primary",
        token: "new_token",
        url: "new_url",
        kind: "feishu_doc",
        contentHash: "h_new",
        version: 2,
        created: false,
      }]
      const merged = mergeReceiptsIntoTaskSpec(taskSpec, receipts)
      const artifacts = merged.artifacts as FeishuAssetReceipt[]
      expect(artifacts).toHaveLength(1)
      expect(artifacts[0].token).toBe("new_token")
      expect(artifacts[0].version).toBe(2)
    })
  })
})
