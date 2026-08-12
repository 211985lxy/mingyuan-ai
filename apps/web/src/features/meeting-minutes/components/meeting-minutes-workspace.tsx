"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Upload, FileVideo, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { listClientProjects, type ClientProject } from "@/lib/api/projects"

interface TranscriptionStats {
  segmentCount: number
  speakerCount: number
  durationSec: number
  totalChars: number
}

type Stage = "idle" | "uploading" | "transcribing" | "insight" | "done" | "error"

export type MeetingMinutesWorkspaceVariant = "page" | "embedded"

/**
 * 会议纪要工作台：上传腾讯会议本地录制 → 云端转写（说话人分离）→ 自动生成洞察。
 *
 * 文件入口走 OSS 直传（不经飞书 IM，规避 100MB 限制）：
 *   选文件 → /api/assets/upload-url 拿 POST Policy → 直传 OSS → complete → assetUrl
 *   → /api/aim/meeting-recording 编排（转写 + 建经营事项 + meeting-insight）
 *
 * variant=embedded：知识库入库弹层用，去掉独立页英雄头。
 */
export function MeetingMinutesWorkspace({
  variant = "page",
}: {
  variant?: MeetingMinutesWorkspaceVariant
} = {}) {
  const router = useRouter()
  const embedded = variant === "embedded"
  const fileInputId = embedded ? "meeting-file-input-embedded" : "meeting-file-input"
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [projectId, setProjectId] = useState("")
  const [customer, setCustomer] = useState("")
  const [meetingTitle, setMeetingTitle] = useState("")
  const [file, setFile] = useState<File | null>(null)
  const [stage, setStage] = useState<Stage>("idle")
  const [error, setError] = useState("")
  const [progressMsg, setProgressMsg] = useState("")
  const [resultLink, setResultLink] = useState("")
  const [stats, setStats] = useState<TranscriptionStats | null>(null)

  async function ensureProjects() {
    if (projectsLoaded) return
    try {
      const list = await listClientProjects()
      setProjects(list)
      setProjectsLoaded(true)
    } catch (err) {
      setError(`加载项目列表失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function onProjectChange(id: string) {
    setProjectId(id)
    const p = projects.find((x) => x.id === id)
    if (p && !customer) setCustomer(p.name ?? "")
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    if (f && !meetingTitle) {
      setMeetingTitle(f.name.replace(/\.[^.]+$/, ""))
    }
  }

  function canSubmit(): boolean {
    return !!file && !!projectId && !!customer.trim() && !!meetingTitle.trim() && stage === "idle"
  }

  async function handleSubmit() {
    if (!file || !projectId || !customer.trim() || !meetingTitle.trim()) return
    setError("")
    setStats(null)
    setResultLink("")

    try {
      // 1. 拿 OSS PostObject 预约（绑定 sizeBytes）
      setStage("uploading")
      setProgressMsg("正在准备上传…")
      const contentType = file.type || "video/mp4"
      const assetType = contentType.startsWith("audio/") ? "audio" : "video"
      const urlRes = await fetch("/api/assets/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType,
          sizeBytes: file.size,
          assetType,
        }),
      })
      if (!urlRes.ok) {
        const e = await urlRes.json().catch(() => ({}))
        throw new Error(e.error ?? `获取上传地址失败 (${urlRes.status})`)
      }
      const { data: uploadData } = await urlRes.json()
      if (!uploadData?.uploadUrl || !uploadData?.fields || !uploadData?.assetUrl) {
        throw new Error("上传地址返回不完整。")
      }

      // 2. POST 直传 OSS（表单字段由服务端签发）
      setProgressMsg(`正在上传 ${file.name}（${(file.size / 1024 / 1024).toFixed(1)} MB）…`)
      const form = new FormData()
      for (const [key, value] of Object.entries(uploadData.fields as Record<string, string>)) {
        form.append(key, value)
      }
      form.append("file", file)
      const postRes = await fetch(uploadData.uploadUrl, { method: "POST", body: form })
      if (!postRes.ok) throw new Error(`上传到 OSS 失败 (${postRes.status})`)

      // 2b. 完成校验并登记素材
      if (uploadData.uploadId) {
        const completeRes = await fetch(
          `/api/assets/uploads/${encodeURIComponent(uploadData.uploadId)}/complete`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: meetingTitle.trim() || file.name }),
          },
        )
        if (!completeRes.ok) {
          const e = await completeRes.json().catch(() => ({}))
          throw new Error(e.error ?? `确认上传失败 (${completeRes.status})`)
        }
      }

      // 3. 转写 + 洞察（编排入口，含转写轮询）
      setStage("transcribing")
      setProgressMsg("正在转写录音（说话人分离）并生成洞察，预计 1-3 分钟…")
      const recRes = await fetch("/api/aim/meeting-recording", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetUrl: uploadData.assetUrl,
          projectId,
          customer: customer.trim(),
          meetingTitle: meetingTitle.trim(),
        }),
      })
      const recBody = await recRes.json().catch(() => ({}))
      if (!recRes.ok) {
        throw new Error(recBody.error ?? `转写/洞察失败 (${recRes.status})`)
      }

      setStage("done")
      setProgressMsg("")
      setStats(recBody.transcription ?? null)
      setResultLink(recBody.resultLink ?? "")
    } catch (err) {
      setStage("error")
      setProgressMsg("")
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const busy = stage === "uploading" || stage === "transcribing" || stage === "insight"

  const form = (
      <Card className={embedded ? "border-0 shadow-none" : "mt-6"}>
        {embedded ? null : (
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileVideo className="size-4" /> 新建会议转写
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className={embedded ? "space-y-5 p-0" : "space-y-5"}>
          {/* 项目选择 */}
          <div className="space-y-2">
            <Label>客户项目</Label>
            <Select
              onOpenChange={(open) => open && ensureProjects()}
              value={projectId}
              onValueChange={(id) => id && onProjectChange(id)}
              disabled={busy}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择客户项目（洞察与纪要归属此项目）" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 客户名称 */}
          <div className="space-y-2">
            <Label>客户名称</Label>
            <Input
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="如：中汝达"
              disabled={busy}
            />
          </div>

          {/* 会议标题 */}
          <div className="space-y-2">
            <Label>会议标题</Label>
            <Input
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="如：数字供暖项目研讨"
              disabled={busy}
            />
          </div>

          {/* 文件选择 */}
          <div className="space-y-2">
            <Label>录制文件（MP4 / 音频，建议 ≤2 小时）</Label>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById(fileInputId)?.click()}
                disabled={busy}
              >
                <Upload className="size-4" /> 选择文件
              </Button>
              <input
                id={fileInputId}
                type="file"
                accept="video/*,audio/*"
                className="hidden"
                onChange={onPickFile}
                disabled={busy}
              />
              <span className="text-sm text-muted-foreground truncate">
                {file ? `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` : "未选择"}
              </span>
            </div>
          </div>

          {/* 提交 */}
          <Button onClick={handleSubmit} disabled={!canSubmit()} className="w-full">
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 处理中…
              </>
            ) : (
              <>
                <Upload className="size-4" /> 上传并生成纪要
              </>
            )}
          </Button>

          {/* 进度 */}
          {busy && progressMsg && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {progressMsg}
            </div>
          )}

          {/* 错误 */}
          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 成功 */}
          {stage === "done" && (
            <div className="space-y-3 rounded-md border border-emerald-500/40 bg-emerald-500/5 p-4">
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                <div className="space-y-2">
                  <div>会议洞察已生成，已进入飞书经营事项「待人工审核」。</div>
                  {stats && (
                    <div className="text-xs text-muted-foreground">
                      时长 {Math.round(stats.durationSec / 60)} 分钟 · {stats.segmentCount} 段 ·{" "}
                      {stats.speakerCount} 位发言人 · {stats.totalChars} 字
                    </div>
                  )}
                  {resultLink && (
                    <Button size="sm" variant="outline" onClick={() => router.push(resultLink)}>
                      查看洞察结果
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
  )

  if (embedded) {
    return <div className="w-full">{form}</div>
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <WorkbenchHero
        title="会议纪要"
        subtitle="上传腾讯会议本地录制，自动转写（说话人分离）并生成结构化洞察与飞书纪要"
        badge="会议纪要 Agent"
        backHref="/knowledge"
        backLabel="返回知识库"
      />
      {form}
    </div>
  )
}
