"use client"

import { FileText } from "lucide-react"

import { MarkdownRenderer } from "@/components/markdown-renderer"
import { parseVideoCopyAnalysisDisplay } from "@/lib/video-copy-display"

export function VideoCopyAnalysisCards({ markdown }: { markdown: string }) {
  const display = parseVideoCopyAnalysisDisplay(markdown)

  if (display.nodes.length === 0) {
    return <MarkdownRenderer content={display.supplementalMarkdown || markdown} />
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3">
        {display.nodes.map((node, index) => (
          <section key={`${node.title}-${index}`} className="rounded-lg border bg-background p-4">
            <div className="mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="text-base font-semibold text-foreground">{node.title}</h3>
            </div>
            {node.original ? (
              <div className="mb-3 rounded-md bg-muted/40 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">原文片段</div>
                <p className="whitespace-pre-wrap text-sm leading-7 text-foreground">{node.original}</p>
              </div>
            ) : null}
            {node.structureEffect ? (
              <div>
                <div className="mb-1 text-xs font-medium text-muted-foreground">结构作用</div>
                <p className="text-sm leading-7 text-muted-foreground">{node.structureEffect}</p>
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {display.supplementalMarkdown ? (
        <div className="border-t pt-4">
          <h3 className="mb-3 text-sm font-semibold text-foreground">补充拆解</h3>
          <MarkdownRenderer content={display.supplementalMarkdown} />
        </div>
      ) : null}
    </div>
  )
}
