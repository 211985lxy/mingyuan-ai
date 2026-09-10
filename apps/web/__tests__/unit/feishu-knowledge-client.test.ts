import { afterEach, describe, expect, it, vi } from "vitest"

import {
  FeishuKnowledgeError,
  clearFeishuKnowledgeTokenCache,
  createFeishuKnowledgeClient,
  isFeishuKnowledgeEnabled,
  parseWikiSpaceIds,
} from "@/lib/integrations/feishu-knowledge-client"
import { executeFeishuKnowledgeTool } from "@/lib/integrations/feishu-knowledge-tool"
import { assertToolAllowedInToolLoop, listToolLoopTools } from "@/lib/aim-harness/tool-registry"
import { executeBoundToolLoopTool } from "@/lib/aim-harness/tool-loop-tools"

const TOKEN = "t-cached-tenant-token"
const APP = { appId: "cli_test", appSecret: "app-secret" }

afterEach(() => {
  clearFeishuKnowledgeTokenCache()
})

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response
}

function createQueuedFetch(replies: Array<(url: string) => Response>) {
  const calls: string[] = []
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input)
    calls.push(url)
    const reply = replies.shift()
    if (!reply) throw new Error(`unexpected fetch: ${url}`)
    return reply(url)
  }
  return { fetchImpl, calls }
}

function tokenReply() {
  return jsonResponse({
    code: 0,
    tenant_access_token: TOKEN,
    expire: 7200,
  })
}

describe("feishu knowledge env helpers", () => {
  it("开关默认关闭，只有 true 才打开", () => {
    expect(isFeishuKnowledgeEnabled(undefined)).toBe(false)
    expect(isFeishuKnowledgeEnabled("false")).toBe(false)
    expect(isFeishuKnowledgeEnabled("true")).toBe(true)
    expect(isFeishuKnowledgeEnabled(" TRUE ")).toBe(true)
  })

  it("解析 wiki 空间白名单", () => {
    expect(parseWikiSpaceIds("space_a, space_b，space_c")).toEqual([
      "space_a",
      "space_b",
      "space_c",
    ])
  })
})

describe("feishu knowledge client", () => {
  it("缓存 tenant token，第二次检索不再换票", async () => {
    const { fetchImpl, calls } = createQueuedFetch([
      () => tokenReply(),
      () =>
        jsonResponse({
          code: 0,
          data: { total: 0, has_more: false, res_units: [] },
        }),
      () =>
        jsonResponse({
          code: 0,
          data: { total: 0, has_more: false, res_units: [] },
        }),
    ])
    const client = createFeishuKnowledgeClient({
      ...APP,
      wikiSpaceIds: ["space_1"],
      fetchImpl,
    })

    await expect(client.search("爆款选题")).rejects.toMatchObject({ kind: "empty" })
    await expect(client.search("爆款选题")).rejects.toMatchObject({ kind: "empty" })
    expect(calls.filter((url) => url.includes("tenant_access_token"))).toHaveLength(1)
  })

  it("user 身份把 search v2 结果裁成标题、摘要和链接，并去掉高亮标签", async () => {
    const { fetchImpl } = createQueuedFetch([
      // user 身份直接带 user_access_token 请求，不先取 tenant token
      () =>
        jsonResponse({
          code: 0,
          data: {
            total: 1,
            has_more: false,
            res_units: [
              {
                title_highlighted: "<h>爆款选题</h>定义与自查表",
                summary_highlighted: "本文介绍<h>爆款选题</h>的判定标准",
                entity_type: "WIKI",
                result_meta: {
                  url: "https://feishu.cn/wiki/wikcn1",
                  token: "wikcn1",
                  doc_types: "DOCX",
                },
              },
            ],
          },
        }),
    ])
    const client = createFeishuKnowledgeClient({
      ...APP,
      userAccessToken: "u-1",
      wikiSpaceIds: ["space_1"],
      fetchImpl,
    })

    const hits = await client.search("爆款选题")
    expect(hits).toEqual([
      {
        title: "爆款选题定义与自查表",
        summary: "本文介绍爆款选题的判定标准",
        url: "https://feishu.cn/wiki/wikcn1",
        token: "wikcn1",
        entityType: "WIKI",
        docType: "DOCX",
      },
    ])
  })

  it("user 身份 search v2 无权限时给出可行动错误，且错误信息不含 token 明文", async () => {
    const { fetchImpl } = createQueuedFetch([
      // user 身份直接带 user_access_token 请求，不先取 tenant token
      () => jsonResponse({ code: 131006, msg: "permission denied" }, false),
    ])
    const client = createFeishuKnowledgeClient({
      ...APP,
      userAccessToken: "u-1",
      wikiSpaceIds: ["space_1"],
      fetchImpl,
    })

    await expect(client.search("爆款选题")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(FeishuKnowledgeError)
      const failed = error as FeishuKnowledgeError
      expect(failed.kind).toBe("permission_denied")
      expect(failed.message).not.toContain(TOKEN)
      expect(failed.nextAction).toMatch(/可见|授权|权限/)
      return true
    })
  })

  it("wiki token 先解析成 obj_token 再读 docx 正文", async () => {
    const { fetchImpl, calls } = createQueuedFetch([
      () => tokenReply(),
      (url) => {
        expect(url).toContain("wiki/v2/spaces/get_node")
        return jsonResponse({
          code: 0,
          data: {
            node: {
              title: "爆款选题定义与自查表",
              node_token: "wikcn1",
              obj_token: "doxcn1",
              obj_type: "docx",
            },
          },
        })
      },
      (url) => {
        expect(url).toContain("docx/v1/documents/doxcn1/raw_content")
        return jsonResponse({
          code: 0,
          data: { content: "爆款选题要先看转化，再看播放。" },
        })
      },
    ])
    const client = createFeishuKnowledgeClient({
      ...APP,
      wikiSpaceIds: ["space_1"],
      fetchImpl,
    })

    const doc = await client.read("wikcn1")
    expect(doc.title).toBe("爆款选题定义与自查表")
    expect(doc.objToken).toBe("doxcn1")
    expect(doc.content).toContain("先看转化")
    expect(calls.some((url) => url.includes("get_node"))).toBe(true)
  })

  it("bot 身份直接走 wiki 节点标题匹配，不请求 search v2", async () => {
    const { fetchImpl, calls } = createQueuedFetch([
      () => tokenReply(),
      () =>
        jsonResponse({
          code: 0,
          data: {
            items: [
              {
                title: "爆款选题定义与自查表",
                node_token: "wikcn1",
                obj_token: "doxcn1",
                obj_type: "docx",
                has_child: false,
              },
              {
                title: "无关会议纪要",
                node_token: "wikcn2",
                obj_token: "doxcn2",
                obj_type: "docx",
                has_child: false,
              },
            ],
            has_more: false,
          },
        }),
    ])
    const client = createFeishuKnowledgeClient({
      ...APP,
      wikiSpaceIds: ["space_1"],
      fetchImpl,
    })

    const hits = await client.search("爆款选题")
    expect(hits).toEqual([
      expect.objectContaining({
        title: "爆款选题定义与自查表",
        token: "wikcn1",
        entityType: "WIKI",
      }),
    ])
    expect(calls.some((url) => url.includes("search/v2/doc_wiki/search"))).toBe(false)
  })

  it("多空间遍历时单空间失败跳过，全部失败才报 permission_denied", async () => {
    const { fetchImpl } = createQueuedFetch([
      () => tokenReply(),
      () => jsonResponse({ code: 131006, msg: "permission denied" }, false),
      () => jsonResponse({ code: 131006, msg: "permission denied" }, false),
    ])
    const client = createFeishuKnowledgeClient({
      ...APP,
      wikiSpaceIds: ["space_1", "space_2"],
      fetchImpl,
    })

    await expect(client.search("爆款选题")).rejects.toMatchObject({ kind: "permission_denied" })
  })
})

describe("feishu knowledge tools", () => {
  it("开关关闭时直接拒绝，不访问飞书", async () => {
    const fetchImpl = vi.fn()
    const output = await executeFeishuKnowledgeTool("feishu_knowledge_search", { query: "爆款选题" }, {
      enabled: false,
      fetchImpl,
    })
    const parsed = JSON.parse(output) as { ok: boolean; kind: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.kind).toBe("disabled")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("缺少 query 时返回可行动错误", async () => {
    const output = await executeFeishuKnowledgeTool("feishu_knowledge_search", {}, {
      enabled: true,
      appId: APP.appId,
      appSecret: APP.appSecret,
      wikiSpaceIds: ["space_1"],
      fetchImpl: vi.fn(),
    })
    const parsed = JSON.parse(output) as { ok: boolean; kind: string }
    expect(parsed.ok).toBe(false)
    expect(parsed.kind).toBe("invalid_input")
  })

  it("注册进 Tool Loop：external、15s、幂等", () => {
    const names = listToolLoopTools().map((tool) => tool.name)
    expect(names).toEqual(expect.arrayContaining(["feishu_knowledge_search", "feishu_doc_read"]))
    const search = assertToolAllowedInToolLoop("feishu_knowledge_search")
    expect(search.permission).toBe("external")
    expect(search.timeoutMs).toBe(15_000)
    expect(search.idempotent).toBe(true)
    expect(assertToolAllowedInToolLoop("feishu_doc_read").permission).toBe("external")
  })

  it("Tool Loop 执行器在开关关闭时拒绝且不发请求", async () => {
    const fetchImpl = vi.fn()
    const output = await executeBoundToolLoopTool(
      "feishu_knowledge_search",
      { query: "爆款选题" },
      {
        userId: "u1",
        rawInput: "爆款选题是什么",
        allowedToolNames: ["feishu_knowledge_search"],
        feishuKnowledge: { enabled: false, fetchImpl },
      },
    )
    expect(JSON.parse(output)).toMatchObject({ ok: false, kind: "disabled" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
