import { describe, expect, it, vi } from "vitest"
import {
  uploadToDrive,
  getDriveMetadata,
  listDriveFiles,
  findExistingByHash,
} from "@/lib/integrations/feishu-drive-publisher"

describe("feishu-drive-publisher", () => {
  describe("uploadToDrive", () => {
    it("上传文件并返回 token/url", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({
          token: "file_abc",
          url: "https://feishu.cn/drive/file_abc",
        }),
        stderr: "",
      }))

      const result = await uploadToDrive({
        filePath: "/tmp/test.pdf",
        folderToken: "folder_x",
        fileName: "test.pdf",
        contentHash: "h123",
        runner,
      })

      expect(result.token).toBe("file_abc")
      expect(result.url).toBe("https://feishu.cn/drive/file_abc")
      expect(result.fileName).toBe("test.pdf")
      expect(result.contentHash).toBe("h123")
      expect(runner).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["--file-path", "/tmp/test.pdf", "--folder-token", "folder_x"]),
      )
    })

    it("缺少 token 时抛出错误", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ url: "https://feishu.cn/drive/x" }),
        stderr: "",
      }))

      await expect(
        uploadToDrive({
          filePath: "/tmp/test.pdf",
          folderToken: "folder_x",
          fileName: "test.pdf",
          contentHash: "h123",
          runner,
        }),
      ).rejects.toThrow("未返回 token")
    })
  })

  describe("getDriveMetadata", () => {
    it("查询文件元数据", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({
          data: {
            token: "file_abc",
            name: "report.pdf",
            type: "pdf",
            url: "https://feishu.cn/drive/file_abc",
            created_time: "2024-01-01T00:00:00Z",
          },
        }),
        stderr: "",
      }))

      const result = await getDriveMetadata({ fileToken: "file_abc", runner })

      expect(result.token).toBe("file_abc")
      expect(result.name).toBe("report.pdf")
      expect(result.type).toBe("pdf")
      expect(result.createdTime).toBe("2024-01-01T00:00:00Z")
    })
  })

  describe("listDriveFiles", () => {
    it("列出文件夹内容", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({
          data: {
            files: [
              { token: "f1", name: "a.pdf", type: "pdf" },
              { token: "f2", name: "b.docx", type: "docx" },
            ],
          },
        }),
        stderr: "",
      }))

      const files = await listDriveFiles({ folderToken: "folder_x", runner })

      expect(files).toHaveLength(2)
      expect(files[0].token).toBe("f1")
      expect(files[0].name).toBe("a.pdf")
      expect(files[1].name).toBe("b.docx")
    })

    it("空文件夹返回空数组", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ data: { files: [] } }),
        stderr: "",
      }))

      const files = await listDriveFiles({ folderToken: "folder_x", runner })
      expect(files).toEqual([])
    })
  })

  describe("findExistingByHash", () => {
    it("按文件名匹配已有文件", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({
          data: {
            files: [
              { token: "f1", name: "report_v1.pdf", type: "pdf" },
              { token: "f2", name: "other.docx", type: "docx" },
            ],
          },
        }),
        stderr: "",
      }))

      const found = await findExistingByHash({
        folderToken: "folder_x",
        fileName: "report_v1.pdf",
        contentHash: "h123",
        runner,
      })

      expect(found).not.toBeNull()
      expect(found!.token).toBe("f1")
    })

    it("无匹配时返回 null", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ data: { files: [{ token: "f1", name: "other.pdf" }] } }),
        stderr: "",
      }))

      const found = await findExistingByHash({
        folderToken: "folder_x",
        fileName: "not_exist.pdf",
        contentHash: "h123",
        runner,
      })

      expect(found).toBeNull()
    })
  })
})
