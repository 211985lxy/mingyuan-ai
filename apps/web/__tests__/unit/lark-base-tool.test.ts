import { describe, expect, it, vi } from "vitest"
import {
  importLarkBaseKnowledge,
  mapLarkKnowledgeCategory,
  readLarkBaseConfig,
  runLarkBaseCommand,
} from "@/lib/lark-base-tool"

describe("lark-base-tool", () => {
  it("requires base and table config before reading Feishu Base", () => {
    expect(() => readLarkBaseConfig({}, "topic_review")).toThrow("LARK_BASE_TOKEN")
    expect(() =>
      readLarkBaseConfig({ LARK_BASE_TOKEN: "base_x" }, "topic_review"),
    ).toThrow("LARK_TOPIC_TABLE_ID")
  })

  it("maps Feishu material types to KnowledgeEntry categories", () => {
    expect(mapLarkKnowledgeCategory("热点")).toBe("hot_topic")
    expect(mapLarkKnowledgeCategory("竞品")).toBe("benchmark_reference")
    expect(mapLarkKnowledgeCategory("用户洞察")).toBe("user_insight")
    expect(mapLarkKnowledgeCategory("定位")).toBe("positioning_material")
    expect(mapLarkKnowledgeCategory("私域")).toBe("private_domain_material")
    expect(mapLarkKnowledgeCategory("别的")).toBe("daily_inspiration")
  })

  it("only runs whitelisted lark-cli base commands", async () => {
    const runner = vi.fn(async () => ({ stdout: "{\"ok\":true}", stderr: "" }))

    await expect(
      runLarkBaseCommand("+record-list", ["--base-token", "base_x"], { runner }),
    ).resolves.toEqual({ ok: true })

    await expect(
      runLarkBaseCommand("+table-delete", ["--base-token", "base_x"], { runner }),
    ).rejects.toThrow("不允许")
  })

  it("imports records into project knowledge and updates duplicate imported titles", async () => {
    const runCommand = vi.fn(async (command: string) => {
      if (command === "+field-list") {
        return { items: [{ field_name: "标题" }, { field_name: "内容" }, { field_name: "类型" }] }
      }
      return {
        items: [
          {
            record_id: "rec_1",
            fields: {
              标题: "飞书热点",
              内容: "多维表格 AI 能力更新，适合做选题。",
              类型: "热点",
              标签: ["飞书"],
            },
          },
        ],
      }
    })
    const db = {
      clientProject: {
        findFirst: vi.fn(async () => ({ id: "project_1", name: "AIM 全案" })),
      },
      knowledgeEntry: {
        findFirst: vi.fn(async () => ({ id: "entry_1" })),
        update: vi.fn(async ({ data }) => ({ id: "entry_1", ...data })),
        create: vi.fn(),
      },
    }

    const result = await importLarkBaseKnowledge({
      userId: "user_1",
      projectId: "project_1",
      tableType: "topic_review",
      env: {
        LARK_BASE_TOKEN: "base_x",
        LARK_TOPIC_TABLE_ID: "tbl_topic",
      },
      db,
      runCommand,
    })

    expect(result).toMatchObject({ created: 0, updated: 1 })
    expect(db.knowledgeEntry.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "entry_1" },
      data: expect.objectContaining({
        projectId: "project_1",
        category: "hot_topic",
        sourceType: "import",
      }),
    }))
    expect(db.knowledgeEntry.create).not.toHaveBeenCalled()
  })
})
