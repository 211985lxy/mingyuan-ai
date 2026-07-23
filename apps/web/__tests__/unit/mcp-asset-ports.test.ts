import { describe, expect, it, vi } from "vitest"
import {
  MCP_TOOLS,
  CREATE_ARTIFACT_TOOL,
  QUERY_ARTIFACT_TOOL,
  UPDATE_ARTIFACT_TOOL,
  LIST_PROJECT_ASSETS_TOOL,
  VERIFY_ARTIFACT_TOOL,
  validateCreateArtifactInput,
  validateUpdateArtifactInput,
  createMcpToolHandlers,
} from "@/lib/aim/artifacts/mcp-asset-ports"

describe("mcp-asset-ports", () => {
  describe("工具定义", () => {
    it("暴露 5 个业务端口", () => {
      expect(MCP_TOOLS).toHaveLength(5)
      const names = MCP_TOOLS.map((t) => t.name)
      expect(names).toContain("create_artifact")
      expect(names).toContain("query_artifact")
      expect(names).toContain("update_artifact")
      expect(names).toContain("list_project_assets")
      expect(names).toContain("verify_artifact")
    })

    it("每个工具有 name/description/inputSchema", () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.inputSchema).toBeDefined()
        expect(tool.inputSchema.type).toBe("object")
      }
    })

    it("create_artifact 有 required 字段", () => {
      const schema = CREATE_ARTIFACT_TOOL.inputSchema as Record<string, unknown>
      const required = schema.required as string[]
      expect(required).toContain("kind")
      expect(required).toContain("title")
      expect(required).toContain("projectId")
    })
  })

  describe("validateCreateArtifactInput", () => {
    it("有效输入返回 null", () => {
      const result = validateCreateArtifactInput({
        kind: "feishu_doc",
        title: "测试",
        projectId: "proj_1",
        workItemRecordId: "rec_1",
        content: "# 内容",
      })
      expect(result).toBeNull()
    })

    it("无效 kind 返回错误", () => {
      const result = validateCreateArtifactInput({
        kind: "invalid_kind",
        title: "测试",
        projectId: "proj_1",
        workItemRecordId: "rec_1",
        content: "内容",
      })
      expect(result).toContain("无效的资产类型")
    })

    it("缺少 title 返回错误", () => {
      const result = validateCreateArtifactInput({
        kind: "feishu_doc",
        projectId: "proj_1",
        workItemRecordId: "rec_1",
        content: "内容",
      })
      expect(result).toContain("title")
    })

    it("缺少 content 返回错误", () => {
      const result = validateCreateArtifactInput({
        kind: "feishu_doc",
        title: "测试",
        projectId: "proj_1",
        workItemRecordId: "rec_1",
      })
      expect(result).toContain("content")
    })
  })

  describe("validateUpdateArtifactInput", () => {
    it("有效输入返回 null", () => {
      const result = validateUpdateArtifactInput({
        artifactKey: "feishu_doc:rec_1:primary",
        newContent: "新内容",
        stage: "draft",
      })
      expect(result).toBeNull()
    })

    it("无效 stage 返回错误", () => {
      const result = validateUpdateArtifactInput({
        artifactKey: "key",
        newContent: "内容",
        stage: "invalid_stage",
      })
      expect(result).toContain("无效的阶段")
    })

    it("缺少 artifactKey 返回错误", () => {
      const result = validateUpdateArtifactInput({
        newContent: "内容",
        stage: "draft",
      })
      expect(result).toContain("artifactKey")
    })
  })

  describe("createMcpToolHandlers", () => {
    const mockServices = {
      createArtifact: vi.fn(async () => ({
        receipts: [{ artifactKey: "k", token: "t", url: "u", kind: "feishu_doc", contentHash: "h", version: 1, created: true }],
      })),
      queryArtifact: vi.fn(async () => []),
      updateArtifact: vi.fn(async () => ({ token: "t", url: "u", version: 2 })),
      listProjectAssets: vi.fn(async () => []),
      verifyArtifact: vi.fn(async () => ({ ok: true, detail: "验证通过" })),
    }

    it("create_artifact 校验失败时返回 isError", async () => {
      const handlers = createMcpToolHandlers(mockServices as never)
      const result = await handlers.create_artifact({ kind: "bad" })
      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain("校验失败")
    })

    it("create_artifact 成功时调用 service", async () => {
      const handlers = createMcpToolHandlers(mockServices as never)
      const result = await handlers.create_artifact({
        kind: "feishu_doc",
        title: "测试",
        projectId: "proj_1",
        workItemRecordId: "rec_1",
        content: "# 内容",
      })
      expect(result.isError).toBeUndefined()
      expect(mockServices.createArtifact).toHaveBeenCalled()
      expect(result.content[0].text).toContain("feishu_doc")
    })

    it("update_artifact 校验失败时返回 isError", async () => {
      const handlers = createMcpToolHandlers(mockServices as never)
      const result = await handlers.update_artifact({ stage: "bad" })
      expect(result.isError).toBe(true)
    })

    it("list_project_assets 缺少 projectId 时返回错误", async () => {
      const handlers = createMcpToolHandlers(mockServices as never)
      const result = await handlers.list_project_assets({})
      expect(result.isError).toBe(true)
    })

    it("verify_artifact 成功时返回验证结果", async () => {
      const handlers = createMcpToolHandlers(mockServices as never)
      const result = await handlers.verify_artifact({ token: "doc_x", kind: "feishu_doc" })
      expect(result.isError).toBeUndefined()
      expect(mockServices.verifyArtifact).toHaveBeenCalledWith({ token: "doc_x", kind: "feishu_doc" })
    })
  })
})
