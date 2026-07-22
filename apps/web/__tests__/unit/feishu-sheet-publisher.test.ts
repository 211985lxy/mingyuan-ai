import { describe, expect, it, vi } from "vitest"
import {
  createFeishuSheet,
  writeFeishuSheet,
  appendFeishuSheet,
  readFeishuSheet,
} from "@/lib/integrations/feishu-sheet-publisher"

describe("feishu-sheet-publisher", () => {
  describe("createFeishuSheet", () => {
    it("创建表格并返回 token/url/sheetId", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({
          token: "sht_abc",
          url: "https://feishu.cn/sheets/sht_abc",
          sheet_id: "Sheet1",
        }),
        stderr: "",
      }))

      const result = await createFeishuSheet({
        title: "测试表格",
        folderToken: "folder_x",
        runner,
      })

      expect(result.token).toBe("sht_abc")
      expect(result.url).toBe("https://feishu.cn/sheets/sht_abc")
      expect(result.title).toBe("测试表格")
      expect(result.sheetId).toBe("Sheet1")
      // 验证传递了 folder-token
      expect(runner).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["--folder-token", "folder_x"]),
      )
    })

    it("缺少 token 时抛出错误", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ url: "https://feishu.cn/sheets/x" }),
        stderr: "",
      }))

      await expect(
        createFeishuSheet({ title: "无token", runner }),
      ).rejects.toThrow("未返回 token")
    })
  })

  describe("writeFeishuSheet", () => {
    it("写入固定区域", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))

      const result = await writeFeishuSheet({
        spreadsheetToken: "sht_abc",
        sheetId: "Sheet1",
        range: "A1:C3",
        values: [["a", "b", "c"], [1, 2, 3]],
        runner,
      })

      expect(result.ok).toBe(true)
      expect(runner).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["--range", "A1:C3", "--spreadsheet-token", "sht_abc"]),
      )
    })
  })

  describe("appendFeishuSheet", () => {
    it("追加数据", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))

      const result = await appendFeishuSheet({
        spreadsheetToken: "sht_abc",
        sheetId: "Sheet1",
        range: "A1",
        values: [["新行1", "新行2"]],
        runner,
      })

      expect(result.ok).toBe(true)
      expect(runner).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(["+append"]),
      )
    })
  })

  describe("readFeishuSheet", () => {
    it("回读数据并统计行列", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({
          data: {
            values: [["h1", "h2", "h3"], ["a", "b"], ["c"]],
          },
        }),
        stderr: "",
      }))

      const result = await readFeishuSheet({
        spreadsheetToken: "sht_abc",
        sheetId: "Sheet1",
        range: "A1:C3",
        runner,
      })

      expect(result.values).toHaveLength(3)
      expect(result.rowCount).toBe(3)
      expect(result.colCount).toBe(3)
    })

    it("空数据返回零行列", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ data: { values: [] } }),
        stderr: "",
      }))

      const result = await readFeishuSheet({
        spreadsheetToken: "sht_abc",
        sheetId: "Sheet1",
        range: "A1:A1",
        runner,
      })

      expect(result.values).toEqual([])
      expect(result.rowCount).toBe(0)
      expect(result.colCount).toBe(0)
    })
  })
})
