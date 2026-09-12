"use client"

import React from "react"
import { Download, FileJson, FileText, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"

const INCLUDED = [
  { label: "内容生成", detail: "输入、口播稿、公众号文章、朋友圈文案、拍摄脚本、原始文案、发布记录" },
  { label: "知识条目", detail: "标题、分类、价值分级、正文、标签" },
  { label: "效果数据", detail: "7/14/30 天窗口的内容信号与商业结果（线索/预约/成交/回款）" },
]

async function fetchExportText(format: "json" | "markdown"): Promise<string> {
  const response = await fetch(`/api/aim/data-export?format=${format}`)
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(payload?.error ?? `导出失败 (${response.status})`)
  }
  return response.text()
}

function saveTextFile(text: string, format: "json" | "markdown"): void {
  const mime = format === "json" ? "application/json" : "text/markdown"
  const extension = format === "json" ? "json" : "md"
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `aim-export.${extension}`
  anchor.click()
  URL.revokeObjectURL(url)
}

function PromiseCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          三条承诺
        </CardTitle>
        <CardDescription>这是 AIM 对项目方的数据主权承诺，导出功能就是承诺的兑现入口。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>
          <span className="font-medium">归属：</span>项目内全部内容、知识条目与效果数据归属项目方，AIM 仅按授权处理。
        </p>
        <p>
          <span className="font-medium">隔离：</span>
          数据按项目隔离——一个 AIM 账号绑定一个 IP 项目，项目之间互不可见；采集来的公开对标数据单独标注为共享，不与你的私有数据混淆。
        </p>
        <p>
          <span className="font-medium">退出：</span>随时一键导出本项目数据（JSON / Markdown），退出后数据仍归项目方所有。
        </p>
      </CardContent>
    </Card>
  )
}

function ScopeCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>导出范围</CardTitle>
        <CardDescription>仅限你绑定的项目；每类单次最多导出 2000 条，触顶会在导出文件里如实标注，全量迁移请联系管理员走运维通道。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {INCLUDED.map((item) => (
          <p key={item.label}>
            <span className="font-medium">{item.label}：</span>
            <span className="text-muted-foreground">{item.detail}</span>
          </p>
        ))}
      </CardContent>
    </Card>
  )
}

function ExportCenterCard({ downloading, onDownload }: { downloading: string | null; onDownload: (format: "json" | "markdown") => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>一键导出</CardTitle>
        <CardDescription>JSON 适合程序处理与备份；Markdown 适合人直接阅读与迁移。</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button onClick={() => onDownload("json")} disabled={downloading !== null}>
          <FileJson className="h-4 w-4" />
          {downloading === "json" ? "导出中…" : "导出 JSON"}
        </Button>
        <Button variant="outline" onClick={() => onDownload("markdown")} disabled={downloading !== null}>
          <FileText className="h-4 w-4" />
          {downloading === "markdown" ? "导出中…" : "导出 Markdown"}
        </Button>
        <p className="flex w-full items-center gap-1 text-xs text-muted-foreground">
          <Download className="h-3 w-3" />
          导出文件包含导出时间、数量与截断说明，可脱离 AIM 独立阅读。
        </p>
      </CardContent>
    </Card>
  )
}

export default function DataOwnershipPage() {
  const [downloading, setDownloading] = React.useState<string | null>(null)

  async function download(format: "json" | "markdown") {
    setDownloading(format)
    try {
      saveTextFile(await fetchExportText(format), format)
      toast.success("导出成功，文件已开始下载")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "导出失败")
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 pb-10">
      <WorkbenchHero
        title="你的数据"
        subtitle="数据归属、隔离方式与退出带走承诺。随时可把绑定项目的数据完整导出。"
        badge={<Badge variant="secondary">数据主权</Badge>}
        actions={
          <Button variant="outline" onClick={() => void download("markdown")} disabled={downloading !== null}>
            <FileText className="h-4 w-4" />
            {downloading === "markdown" ? "导出中…" : "导出 Markdown"}
          </Button>
        }
      />
      <PromiseCard />
      <ScopeCard />
      <ExportCenterCard downloading={downloading} onDownload={(format) => void download(format)} />
    </div>
  )
}
