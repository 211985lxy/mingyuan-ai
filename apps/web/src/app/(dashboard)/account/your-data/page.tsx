"use client"

import { useState } from "react"
import { Download, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/page-header"
import { DATA_SOVEREIGNTY_COPY } from "@/lib/aim/project-data-export"

async function downloadExport(format: "json" | "md") {
  const response = await fetch(`/api/account/data-export?format=${format}`, { credentials: "same-origin" })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "导出失败" })) as { error?: string }
    throw new Error(payload.error || `导出失败（${response.status}）`)
  }
  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition") || ""
  const matched = disposition.match(/filename="([^"]+)"/)
  const fileName = matched?.[1] || `aim-export.${format}`
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function YourDataPage() {
  const [busy, setBusy] = useState<"json" | "md" | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExport(format: "json" | "md") {
    setBusy(format)
    setError(null)
    try {
      await downloadExport(format)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "导出失败")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="你的数据" subtitle="当前绑定项目可以整包带走。导出是快照，不会改库。" backHref="/account" backLabel="返回账户设置" />

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{DATA_SOVEREIGNTY_COPY.title}</CardTitle>
            <Badge variant="secondary">项目级</Badge>
          </div>
          <CardDescription>签单时可以给人看的那几句，写在产品里，不藏在合同附录。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-6 text-foreground/85">
          <p>{DATA_SOVEREIGNTY_COPY.ownership}</p>
          <p>{DATA_SOVEREIGNTY_COPY.isolation}</p>
          <p>{DATA_SOVEREIGNTY_COPY.exit}</p>
          <p className="text-muted-foreground">{DATA_SOVEREIGNTY_COPY.notIncluded}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>一键导出</CardTitle>
          <CardDescription>带走内容、知识条目、效果数据和素材引用清单。选 JSON 方便机器读，选 Markdown 方便人读。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => void handleExport("md")} disabled={busy !== null}>
            <Download className="mr-1.5 h-4 w-4" />
            {busy === "md" ? "正在导出…" : "导出 Markdown"}
          </Button>
          <Button variant="outline" onClick={() => void handleExport("json")} disabled={busy !== null}>
            <Download className="mr-1.5 h-4 w-4" />
            {busy === "json" ? "正在导出…" : "导出 JSON"}
          </Button>
        </CardContent>
      </Card>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : null}
    </div>
  )
}
