import { describe, expect, it } from "vitest"
import {
  mapGenerationToArtifacts,
  getArtifactMapper,
  type ArtifactMapperInput,
} from "@/lib/aim/artifacts/artifact-mappers"

function makeInput(overrides: Partial<ArtifactMapperInput> = {}): ArtifactMapperInput {
  return {
    generationId: "gen_001",
    workItemRecordId: "rec_001",
    projectId: "proj_001",
    agentId: "content_producer",
    rawCopy: "# 测试内容\n\n这是生成的内容。",
    taskSpec: {},
    ...overrides,
  }
}

describe("artifact-mappers", () => {
  describe("注册表", () => {
    it("所有 6 个智能体映射器已注册", () => {
      const agentIds = [
        "content_producer",
        "work_editor",
        "content_review",
        "business_system_diagnosis",
        "content_growth",
        "consulting_delivery",
      ]
      for (const id of agentIds) {
        expect(getArtifactMapper(id)).toBeDefined()
      }
    })

    it("未注册的智能体返回 undefined", () => {
      expect(getArtifactMapper("unknown_agent")).toBeUndefined()
    })
  })

  describe("content_producer", () => {
    it("映射为文案 Doc + 内容日历 Base", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "content_producer",
        taskSpec: { contentTitle: "春季促销文案" },
      }))

      expect(specs).toHaveLength(2)
      expect(specs[0].kind).toBe("feishu_doc")
      expect(specs[0].role).toBe("primary")
      expect(specs[0].title).toContain("春季促销文案")
      expect(specs[1].kind).toBe("feishu_base_records")
      expect(specs[1].role).toBe("secondary")
    })
  })

  describe("work_editor", () => {
    it("映射为编辑稿 Doc", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "work_editor",
        taskSpec: { articleTitle: "深度分析" },
      }))

      expect(specs.length).toBeGreaterThanOrEqual(1)
      expect(specs[0].kind).toBe("feishu_doc")
      expect(specs[0].title).toContain("深度分析")
    })

    it("有配图时生成 Drive 资产", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "work_editor",
        taskSpec: { articleTitle: "稿件", imagePaths: ["/tmp/img1.png", "/tmp/img2.png"] },
      }))

      expect(specs).toHaveLength(3) // 1 doc + 2 images
      expect(specs[1].kind).toBe("feishu_drive_file")
      expect(specs[2].kind).toBe("feishu_drive_file")
    })
  })

  describe("content_review", () => {
    it("映射为质检报告 Doc + Base", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "content_review",
        taskSpec: { reviewTarget: "周报", verdict: "通过" },
      }))

      expect(specs).toHaveLength(2)
      expect(specs[0].kind).toBe("feishu_doc")
      expect(specs[0].title).toContain("周报")
      expect(specs[1].kind).toBe("feishu_base_records")
    })
  })

  describe("business_system_diagnosis", () => {
    it("映射为诊断报告 Doc + Base", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "business_system_diagnosis",
        taskSpec: { diagnosisTitle: "Q1经营分析", diagnosisType: "季度" },
      }))

      expect(specs.length).toBeGreaterThanOrEqual(2)
      expect(specs[0].kind).toBe("feishu_doc")
      expect(specs[0].role).toBe("primary")
      expect(specs[1].kind).toBe("feishu_base_records")
    })

    it("有指标矩阵时生成 Sheets", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "business_system_diagnosis",
        taskSpec: {
          diagnosisTitle: "诊断",
          metricsMatrix: { headers: ["指标", "值"], rows: [["营收", "100万"]] },
        },
      }))

      expect(specs).toHaveLength(3)
      expect(specs[2].kind).toBe("feishu_sheet")
    })
  })

  describe("content_growth", () => {
    it("映射为选题池 Base + 复盘 Doc", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "content_growth",
        taskSpec: { growthTitle: "3月选题", growthType: "选题" },
        rawCopy: "这是一段足够长的复盘内容，超过五十个字符的阈值，用于触发次要资产文档的生成逻辑。",
      }))

      expect(specs.length).toBeGreaterThanOrEqual(1)
      expect(specs[0].kind).toBe("feishu_base_records")
      expect(specs[0].role).toBe("primary")
    })
  })

  describe("consulting_delivery", () => {
    it("映射为交付方案 Doc + 任务 Base", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "consulting_delivery",
        taskSpec: { deliveryTitle: "数字化转型方案" },
      }))

      expect(specs.length).toBeGreaterThanOrEqual(2)
      expect(specs[0].kind).toBe("feishu_doc")
      expect(specs[0].permissionProfile).toBe("client_delivery")
      expect(specs[1].kind).toBe("feishu_base_records")
    })

    it("有附件时生成 Drive 资产", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "consulting_delivery",
        taskSpec: {
          deliveryTitle: "方案",
          attachmentPaths: ["/data/report.pdf", "/data/slides.pptx"],
        },
      }))

      expect(specs).toHaveLength(4) // doc + base + 2 files
      expect(specs[2].kind).toBe("feishu_drive_file")
      expect(specs[3].kind).toBe("feishu_drive_file")
    })
  })

  describe("未注册智能体", () => {
    it("返回空数组", () => {
      const specs = mapGenerationToArtifacts(makeInput({ agentId: "unknown" }))
      expect(specs).toEqual([])
    })
  })

  describe("artifactKey 格式", () => {
    it("所有 spec 的 artifactKey 包含 kind 和 recordId", () => {
      const specs = mapGenerationToArtifacts(makeInput({
        agentId: "consulting_delivery",
        taskSpec: { deliveryTitle: "测试" },
      }))
      for (const spec of specs) {
        expect(spec.artifactKey).toContain(spec.kind)
        expect(spec.artifactKey).toContain("rec_001")
      }
    })
  })
})
