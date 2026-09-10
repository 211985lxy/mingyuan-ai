import { describe, expect, it } from "vitest"

import {
  collectFeishuKnowledgeSources,
} from "@/lib/integrations/feishu-knowledge-cite"
import {
  decodeFeishuSourceHeader,
  encodeFeishuSourceHeader,
} from "@/lib/integrations/feishu-knowledge-source"
import { mapEntriesToKnowledgeUsed } from "@/lib/aim-knowledge-cite"

const USER_ACCESS = "u-secret-access-token"
const DOC_URL = "https://feishu.cn/wiki/wikcn1"

describe("feishu knowledge cite", () => {
  it("从检索结果抽出标题和链接，且不含用户令牌", () => {
    const digest = collectFeishuKnowledgeSources([
      {
        toolName: "feishu_knowledge_search",
        toolArgs: { query: "爆款选题" },
        observation: JSON.stringify({
          ok: true,
          identity: "user",
          access_token: USER_ACCESS,
          results: [
            {
              title: "爆款选题定义与自查表",
              url: DOC_URL,
              token: "wikcn1",
              summary: "先看转化",
            },
          ],
        }),
      },
    ])
    expect(digest.identity).toBe("user")
    expect(digest.queries).toEqual(["爆款选题"])
    expect(digest.sources).toEqual([
      expect.objectContaining({
        title: "爆款选题定义与自查表",
        url: DOC_URL,
        token: "wikcn1",
      }),
    ])
    expect(JSON.stringify(digest)).not.toContain(USER_ACCESS)
  })

  it("拒绝非飞书链接，避免把乱七八糟的地址挂到回答上", () => {
    const digest = collectFeishuKnowledgeSources([
      {
        toolName: "feishu_knowledge_search",
        toolArgs: { query: "选题" },
        observation: JSON.stringify({
          ok: true,
          results: [{ title: "钓鱼页", url: "https://evil.example/doc", token: "x" }],
        }),
      },
    ])
    expect(digest.sources).toEqual([])
  })

  it("来源头编解码只带标题和链接，不含用户令牌", () => {
    const packed = encodeFeishuSourceHeader([{ title: "爆款选题定义与自查表", url: DOC_URL }])
    expect(packed).not.toContain("u-secret")
    expect(decodeFeishuSourceHeader(packed)).toEqual([{ title: "爆款选题定义与自查表", url: DOC_URL }])
  })

  it("审计摘要只保留查询词和标题链接", () => {
    const digest = collectFeishuKnowledgeSources([
      {
        toolName: "feishu_doc_read",
        observation: JSON.stringify({
          ok: true,
          identity: "bot",
          title: "爆款选题定义与自查表",
          url: DOC_URL,
          token: "wikcn1",
          content: "正文",
          access_token: USER_ACCESS,
        }),
      },
    ])
    const cited = digest.sources.map(({ title, url }) => ({ title, url }))
    expect(cited).toEqual([{ title: "爆款选题定义与自查表", url: DOC_URL }])
    expect(JSON.stringify({ queries: digest.queries, identity: digest.identity, cited })).not.toContain(USER_ACCESS)
  })

  it("飞书来源能写进 knowledgeUsed，带外链", () => {
    const refs = mapEntriesToKnowledgeUsed([
      {
        id: "wikcn1",
        title: "爆款选题定义与自查表",
        category: "feishu",
        url: DOC_URL,
        content: "先看转化",
      },
    ])
    expect(refs[0]).toMatchObject({
      category: "feishu",
      categoryLabel: "飞书",
      url: DOC_URL,
    })
  })
})