"use client"

import type { FeishuKnowledgeSourceCard } from "@/lib/integrations/feishu-knowledge-source"

export function FeishuKnowledgeSourceCards({
  sources,
}: {
  sources?: FeishuKnowledgeSourceCard[] | null
}) {
  const items = (sources ?? []).filter((item) => item.title && item.url)
  if (items.length === 0) return null
  return (
    <div className="mt-3 max-w-2xl rounded-xl border border-border/80 bg-secondary/60 px-3 py-2.5">
      <p className="text-xs font-medium text-foreground">内容来自你的飞书</p>
      <ul className="mt-1.5 space-y-1">
        {items.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
