import { describe, expect, it, vi } from "vitest"
import {
  resolveDocUpdateStrategy,
  buildStandardDocStructure,
  detectHumanEdit,
  executeDocVersionUpdate,
  HUMAN_EDIT_SECTION_MARKER,
  HUMAN_EDIT_PLACEHOLDER,
  type DocVersionContext,
} from "@/lib/aim/artifacts/doc-version-protection"

describe("doc-version-protection", () => {
  describe("resolveDocUpdateStrategy", () => {
    it("draft 阶段 → overwrite_draft", () => {
      const ctx: DocVersionContext = {
        stage: "draft",
        currentVersion: 1,
        humanEdited: false,
      }
      expect(resolveDocUpdateStrategy(ctx)).toBe("overwrite_draft")
    })

    it("pending_review 阶段 → append_revision", () => {
      const ctx: DocVersionContext = {
        stage: "pending_review",
        existingDocToken: "doc_x",
        currentVersion: 1,
        humanEdited: false,
      }
      expect(resolveDocUpdateStrategy(ctx)).toBe("append_revision")
    })

    it("completed 阶段 → create_new_version", () => {
      const ctx: DocVersionContext = {
        stage: "completed",
        existingDocToken: "doc_x",
        currentVersion: 2,
        humanEdited: false,
      }
      expect(resolveDocUpdateStrategy(ctx)).toBe("create_new_version")
    })

    it("human_edited 阶段 → append_revision（禁止 overwrite）", () => {
      const ctx: DocVersionContext = {
        stage: "human_edited",
        existingDocToken: "doc_x",
        currentVersion: 1,
        humanEdited: true,
      }
      expect(resolveDocUpdateStrategy(ctx)).toBe("append_revision")
    })

    it("人工已编辑 + draft 阶段 → append_revision（保护人工内容）", () => {
      const ctx: DocVersionContext = {
        stage: "draft",
        existingDocToken: "doc_x",
        currentVersion: 1,
        humanEdited: true,
      }
      expect(resolveDocUpdateStrategy(ctx)).toBe("append_revision")
    })

    it("人工已编辑 + completed 阶段 → create_new_version", () => {
      const ctx: DocVersionContext = {
        stage: "completed",
        existingDocToken: "doc_x",
        currentVersion: 3,
        humanEdited: true,
      }
      expect(resolveDocUpdateStrategy(ctx)).toBe("create_new_version")
    })
  })

  describe("buildStandardDocStructure", () => {
    it("生成包含所有标准段落的文档", () => {
      const doc = buildStandardDocStructure({
        title: "测试文档",
        confirmedContent: "已确认内容",
        aimDraft: "AIM 草稿内容",
        pendingQuestions: ["问题1", "问题2"],
        version: 1,
        runInfo: "model: gpt-4",
      })

      expect(doc).toContain("# 测试文档")
      expect(doc).toContain("## 当前确认版本")
      expect(doc).toContain("已确认内容")
      expect(doc).toContain("## AIM 草稿区")
      expect(doc).toContain("AIM 草稿内容")
      expect(doc).toContain(HUMAN_EDIT_SECTION_MARKER)
      expect(doc).toContain(HUMAN_EDIT_PLACEHOLDER)
      expect(doc).toContain("## 待确认问题")
      expect(doc).toContain("- 问题1")
      expect(doc).toContain("- 问题2")
      expect(doc).toContain("## 版本记录")
      expect(doc).toContain("v1")
      expect(doc).toContain("## 运行与来源信息")
      expect(doc).toContain("model: gpt-4")
    })

    it("无待确认问题时显示占位", () => {
      const doc = buildStandardDocStructure({
        title: "空问题",
        confirmedContent: "",
        aimDraft: "草稿",
        version: 1,
      })
      expect(doc).toContain("- （无）")
    })
  })

  describe("detectHumanEdit", () => {
    it("人工编辑区有内容 → true", () => {
      const content = [
        "# 文档",
        "## AIM 草稿区",
        "AI 内容",
        HUMAN_EDIT_SECTION_MARKER,
        "人工修改了这里",
        "## 待确认问题",
      ].join("\n")
      expect(detectHumanEdit(content)).toBe(true)
    })

    it("人工编辑区只有占位符 → false", () => {
      const content = [
        "# 文档",
        HUMAN_EDIT_SECTION_MARKER,
        HUMAN_EDIT_PLACEHOLDER,
        "## 待确认问题",
      ].join("\n")
      expect(detectHumanEdit(content)).toBe(false)
    })

    it("无人工编辑区标记 → false", () => {
      const content = "# 文档\n## AIM 草稿区\n内容"
      expect(detectHumanEdit(content)).toBe(false)
    })

    it("人工编辑区为空 → false", () => {
      const content = [
        "# 文档",
        HUMAN_EDIT_SECTION_MARKER,
        "",
        "## 待确认问题",
      ].join("\n")
      expect(detectHumanEdit(content)).toBe(false)
    })
  })

  describe("executeDocVersionUpdate", () => {
    it("draft 阶段首次创建文档", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ token: "doc_new", url: "https://feishu.cn/docx/doc_new" }),
        stderr: "",
      }))

      const result = await executeDocVersionUpdate({
        context: { stage: "draft", currentVersion: 0, humanEdited: false },
        title: "新文档",
        newContent: "# 内容",
        folderToken: "folder_x",
        runner,
      })

      expect(result.strategy).toBe("overwrite_draft")
      expect(result.token).toBe("doc_new")
      expect(result.version).toBe(1)
    })

    it("pending_review 阶段追加修订稿", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))

      const result = await executeDocVersionUpdate({
        context: {
          stage: "pending_review",
          existingDocToken: "doc_existing",
          currentVersion: 1,
          humanEdited: false,
        },
        title: "修订文档",
        newContent: "修订内容",
        runner,
      })

      expect(result.strategy).toBe("append_revision")
      expect(result.token).toBe("doc_existing")
      expect(result.version).toBe(2)
      // 验证使用了 append 模式
      expect(runner).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["--mode", "append"]),
      )
    })

    it("completed 阶段创建新版本", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ token: "doc_v3", url: "https://feishu.cn/docx/doc_v3" }),
        stderr: "",
      }))

      const result = await executeDocVersionUpdate({
        context: {
          stage: "completed",
          existingDocToken: "doc_old",
          currentVersion: 2,
          humanEdited: false,
        },
        title: "完成文档",
        newContent: "最终版本",
        runner,
      })

      expect(result.strategy).toBe("create_new_version")
      expect(result.version).toBe(3)
      expect(result.token).toBe("doc_v3")
    })

    it("人工已编辑时禁止 overwrite，使用 append", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))

      const result = await executeDocVersionUpdate({
        context: {
          stage: "human_edited",
          existingDocToken: "doc_human",
          currentVersion: 1,
          humanEdited: true,
        },
        title: "人工编辑过的文档",
        newContent: "AI 新内容",
        runner,
      })

      expect(result.strategy).toBe("append_revision")
      expect(result.version).toBe(2)
    })
  })
})
