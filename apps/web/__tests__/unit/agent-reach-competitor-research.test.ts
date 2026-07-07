import { describe, expect, it } from "vitest"

import { parseBingRss } from "@/lib/competitor-research/agent-reach"

describe("parseBingRss", () => {
  it("parses items and strips html noise", () => {
    const xml = `<?xml version="1.0"?>
<rss><channel>
  <item>
    <title><![CDATA[测试标题]]></title>
    <link>https://example.com/post</link>
    <description><![CDATA[这是一段<b>摘要</b>]]></description>
    <pubDate>Mon, 07 Jul 2026 08:00:00 GMT</pubDate>
  </item>
  <item>
    <title>第二条</title>
    <link>https://www.example.org/next</link>
    <description>更多内容</description>
    <pubDate>Tue, 08 Jul 2026 09:00:00 GMT</pubDate>
  </item>
</channel></rss>`

    expect(parseBingRss(xml)).toEqual([
      {
        title: "测试标题",
        url: "https://example.com/post",
        snippet: "这是一段 摘要",
        publishedAt: "Mon, 07 Jul 2026 08:00:00 GMT",
        source: "example.com",
      },
      {
        title: "第二条",
        url: "https://www.example.org/next",
        snippet: "更多内容",
        publishedAt: "Tue, 08 Jul 2026 09:00:00 GMT",
        source: "example.org",
      },
    ])
  })
})
