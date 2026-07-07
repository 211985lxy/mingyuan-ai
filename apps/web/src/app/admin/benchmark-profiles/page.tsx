"use client"

import React from "react"
import Link from "next/link"
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Plus,
  Search,
  Target,
  Undo2,
  Upload,
  X,
  Users,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getStoredAdminToken } from "@/lib/admin-store"
import { cn } from "@/lib/utils"

// ── 常量 ──

const PLATFORM_LABELS: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  bilibili: "B站",
  kuaishou: "快手",
}

const PLATFORM_COLORS: Record<string, string> = {
  douyin: "bg-pink-50 text-pink-700 border-pink-200",
  xiaohongshu: "bg-red-50 text-red-700 border-red-200",
  bilibili: "bg-blue-50 text-blue-700 border-blue-200",
  kuaishou: "bg-orange-50 text-orange-700 border-orange-200",
}

const KIND_LABELS: Record<string, string> = {
  note: "笔记",
  report: "诊断报告",
  copy_extraction: "文案提取",
  video: "爆款样本",
  account_pool: "账号池",
  structure_asset: "结构资产",
  topic_candidates: "选题池",
}

const KIND_COLORS: Record<string, string> = {
  note: "bg-gray-100 text-gray-600",
  report: "bg-indigo-50 text-indigo-600",
  copy_extraction: "bg-amber-50 text-amber-600",
  video: "bg-emerald-50 text-emerald-600",
  account_pool: "bg-violet-50 text-violet-600",
  structure_asset: "bg-fuchsia-50 text-fuchsia-600",
  topic_candidates: "bg-orange-50 text-orange-600",
}

function formatFollowerCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ""
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万粉丝`
  return `${n}粉丝`
}

// ── 类型 ──

interface ProfileListItem {
  id: string
  name: string
  platform: string
  accountUrl: string | null
  followerCount: number | null
  positioning: string | null
  personaTags: unknown
  status: string
  createdAt: string
  updatedAt: string
  project: { id: string; name: string; companyName: string | null; industry: string | null; status: string } | null
  user: { id: string; name: string | null; email: string } | null
  items: Array<{ id: string; kind: string; title: string; content: string }>
  _count: { items: number }
}

interface ImportedFile {
  name: string
  text: string
}

// ── 项目选择器 ──

function ProjectSelector({
  value,
  onChange,
  token,
}: {
  value: string
  onChange: (projectId: string) => void
  token: string
}) {
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string; companyName: string | null }>>([])
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!token) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch("/api/admin/projects?status=active&pageSize=100", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => setProjects(j.data ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [token])

  return (
    <Select value={value} onValueChange={(v) => { if (v) onChange(v) }}>
      <SelectTrigger className="h-10">
        <SelectValue placeholder={loading ? "加载中..." : "选择项目 *"} />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            {p.name}{p.companyName ? ` · ${p.companyName}` : ""}
          </SelectItem>
        ))}
        {projects.length === 0 && !loading && (
          <div className="px-2 py-3 text-sm text-muted-foreground text-center">暂无项目</div>
        )}
      </SelectContent>
    </Select>
  )
}

// ── 主页面 ──

export default function BenchmarkProfilesPage() {
  const [profiles, setProfiles] = React.useState<ProfileListItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const pageSize = 20

  // 搜索 & 过滤
  const [search, setSearch] = React.useState("")
  const [platformFilter, setPlatformFilter] = React.useState("")
  const [statusTab, setStatusTab] = React.useState("active")

  // 新建对话框
  const [createOpen, setCreateOpen] = React.useState(false)
  const [createMode, setCreateMode] = React.useState<"account" | "note">("note")
  const [form, setForm] = React.useState({
    content: "",
    accountName: "",
    platform: "",
    accountUrl: "",
    followerCount: "",
    projectId: "",
    notes: "",
  })
  const [creating, setCreating] = React.useState(false)
  const [createError, setCreateError] = React.useState<string | null>(null)
  const [duplicateNotice, setDuplicateNotice] = React.useState<string | null>(null)
  const [importingFiles, setImportingFiles] = React.useState(false)
  const [isDraggingFile, setIsDraggingFile] = React.useState(false)
  const [importedFiles, setImportedFiles] = React.useState<ImportedFile[]>([])
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const totalPages = Math.ceil(total / pageSize)

  const fetchProfiles = React.useCallback(async (p = page) => {
    setLoading(true)
    try {
      const token = getStoredAdminToken()
      const params = new URLSearchParams({
        status: statusTab,
        page: String(p),
        pageSize: String(pageSize),
      })
      if (search.trim()) params.set("search", search.trim())
      if (platformFilter) params.set("platform", platformFilter)

      const res = await fetch(`/api/admin/benchmark-profiles?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error("加载失败")
      const json = await res.json()
      setProfiles(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch {
      setProfiles([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, statusTab, search, platformFilter])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchProfiles()
  }, [fetchProfiles])

  // 搜索提交
  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
    fetchProfiles(1)
  }

  // 过滤变更
  function handlePlatformChange(val: string) {
    setPlatformFilter(val === "all" ? "" : val)
    setPage(1)
  }

  // 状态 tab 切换
  function handleStatusChange(val: string) {
    setStatusTab(val)
    setPage(1)
  }

  // 恢复已归档档案
  async function handleRestore(id: string) {
    const token = getStoredAdminToken()
    try {
      const res = await fetch(`/api/admin/benchmark-profiles/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ status: "active" }),
      })
      if (res.ok) fetchProfiles()
    } catch {
      // ignore
    }
  }

  // ── 创建 ──

  async function handleCreate() {
    const { accountName, platform, accountUrl, followerCount, projectId, content, notes } = form

    if (!accountName.trim()) {
      setCreateError("请填写账号名字或名称")
      return
    }
    if (createMode === "account" && !platform) {
      setCreateError("真实账号模式必须选择平台")
      return
    }
    if (createMode === "note" && !content.trim()) {
      setCreateError("请粘贴或上传聊天记录 / Markdown 文档")
      return
    }
    if (!projectId) {
      setCreateError("请选择归属项目")
      return
    }

    setCreating(true)
    setCreateError(null)
    setDuplicateNotice(null)
    try {
      const token = getStoredAdminToken()

      // 创建档案
      const profileRes = await fetch("/api/admin/benchmark-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          name: accountName.trim(),
          platform: createMode === "account" ? platform : undefined,
          accountUrl: accountUrl.trim() || undefined,
          followerCount: followerCount ? Number(followerCount) : undefined,
          projectId,
          notes: notes.trim() || undefined,
        }),
      })
      const profileJson = await profileRes.json().catch(() => ({} as { error?: string; data?: unknown; duplicate?: boolean }))

      if (!profileRes.ok) {
        throw new Error(profileJson.error || "创建档案失败")
      }

      const profileData = profileJson.data

      // 去重提示
      if (profileJson.duplicate) {
        setDuplicateNotice(`已存在同名档案「${profileData.name}」，内容已追加到已有档案`)
      }

      // 客户资料模式：写入 item（不再双写 notes）
      if (createMode === "note" && content.trim()) {
        await fetch(`/api/admin/benchmark-profiles/${profileData.id}/items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            title: `${accountName.trim()}的聊天/文档资料`,
            kind: "note",
            content: content.trim(),
          }),
        })
      }

      setCreateOpen(false)
      resetForm()
      fetchProfiles()
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "创建失败")
    } finally {
      setCreating(false)
    }
  }

  function resetForm() {
    setForm({ content: "", accountName: "", platform: "", accountUrl: "", followerCount: "", projectId: "", notes: "" })
    setImportedFiles([])
    setCreateError(null)
    setDuplicateNotice(null)
  }

  // ── 文件导入 ──

  async function importFiles(files: File[]) {
    if (files.length === 0) return

    setImportingFiles(true)
    setCreateError(null)
    try {
      const token = getStoredAdminToken()
      const body = new FormData()
      for (const file of files) body.append("files", file)

      const res = await fetch("/api/admin/benchmark-profiles/import-text", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "文件解析失败")

      const parsedFiles = (json.data?.files ?? []) as ImportedFile[]
      const combinedText = String(json.data?.combinedText ?? "").trim()
      if (!combinedText) throw new Error("文件内容为空")

      setImportedFiles((current) => [...current, ...parsedFiles])
      setForm((f) => ({
        ...f,
        accountName: f.accountName || parsedFiles[0]?.name.replace(/\.[^.]+$/, "") || "",
        content: [f.content, combinedText].filter(Boolean).join("\n\n"),
      }))
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "文件解析失败")
    } finally {
      setImportingFiles(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function removeImportedFile(index: number) {
    setImportedFiles((current) => current.filter((_, i) => i !== index))
    setForm((f) => ({ ...f, content: f.content })) // keep content as-is
  }

  function handleDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault()
      setIsDraggingFile(true)
    }
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsDraggingFile(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    setIsDraggingFile(false)
    importFiles(Array.from(e.dataTransfer.files))
  }

  function handleDialogOpenChange(open: boolean) {
    setCreateOpen(open)
    setIsDraggingFile(false)
    if (!open && !creating && !importingFiles) {
      resetForm()
    }
  }

  function handleFileUpload(files: FileList | null) {
    if (!files?.length) return
    importFiles(Array.from(files))
  }

  function triggerFilePicker() {
    if (importingFiles) return
    fileInputRef.current?.click()
  }

  const supportedFileText = ".txt / .md / .pdf / .docx / .xlsx / .csv"

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* 标题栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">真实档案</h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理真实账号和客户资料，素材自动进入 AIM 检索
          </p>
        </div>
        <Button className="cursor-pointer" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          添加档案
        </Button>
      </div>

      {/* 搜索 & 过滤 */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 min-w-[200px] max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="搜索档案名称..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" size="sm" variant="outline">
            搜索
          </Button>
        </form>

        <Select value={platformFilter || "all"} onValueChange={(v) => { if (v) handlePlatformChange(v) }}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue placeholder="全部平台" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部平台</SelectItem>
            {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Tabs value={statusTab} onValueChange={handleStatusChange}>
          <TabsList>
            <TabsTrigger value="active">活跃</TabsTrigger>
            <TabsTrigger value="archived">已归档</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : profiles.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <Target className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium">
                {statusTab === "archived" ? "没有已归档的档案" : "还没有档案"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {statusTab === "archived"
                  ? "归档的档案会显示在这里"
                  : "添加一个真实账号或客户资料即可"}
              </p>
            </div>
            {statusTab !== "archived" && (
              <Button variant="outline" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                添加档案
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((profile) => (
              <Card key={profile.id} className="h-full transition-colors hover:border-foreground/20">
                <CardContent className="space-y-3 p-5">
                  {/* 名称 + 平台 */}
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/admin/benchmark-profiles/${profile.id}`}
                      className="min-w-0 text-base font-semibold truncate hover:underline"
                    >
                      {profile.name}
                    </Link>
                    {profile.platform && PLATFORM_LABELS[profile.platform] && (
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 text-[10px]", PLATFORM_COLORS[profile.platform])}
                      >
                        {PLATFORM_LABELS[profile.platform]}
                      </Badge>
                    )}
                  </div>

                  {/* 定位 */}
                  {profile.positioning && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{profile.positioning}</p>
                  )}

                  {/* 元信息 */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {profile._count.items} 份资料
                    </span>
                    {profile.followerCount != null && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {formatFollowerCount(profile.followerCount)}
                      </span>
                    )}
                  </div>

                  {/* 项目 */}
                  {profile.project && (
                    <div className="text-xs text-muted-foreground truncate">
                      项目：{profile.project.name}
                    </div>
                  )}

                  {profile.items.length > 0 && (
                    <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs">
                      {profile.items.map((item) => (
                        <div key={item.id} className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className={cn("shrink-0 px-1.5 py-0 text-[10px]", KIND_COLORS[item.kind])}>
                              {KIND_LABELS[item.kind] ?? item.kind}
                            </Badge>
                            <span className="truncate font-medium">{item.title}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-muted-foreground">
                            {item.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 操作 */}
                  <div className="flex items-center gap-2 pt-1 border-t">
                    <Link href={`/admin/benchmark-profiles/${profile.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        查看详情
                      </Button>
                    </Link>
                    {statusTab === "archived" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRestore(profile.id)}
                        className="text-emerald-600 hover:text-emerald-700"
                      >
                        <Undo2 className="h-3.5 w-3.5 mr-1" />
                        恢复
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 分页 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages}（共 {total} 条）
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* ── 新建对话框 ── */}
      <Dialog open={createOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent
          className={cn(
            "max-w-md gap-5 rounded-xl bg-background p-5 transition-colors",
            isDraggingFile && "border-primary bg-primary/5"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <DialogHeader>
            <DialogTitle>添加档案</DialogTitle>
            <DialogDescription className="leading-6">
              {createMode === "account"
                ? "录入真实账号信息，后续可通过「一键拉取」导入账号分析。"
                : "粘贴聊天记录、客户资料或 Markdown 文档，保存后进入该项目的 AIM 检索。"}
            </DialogDescription>
          </DialogHeader>

          {/* 模式切换 */}
          <Tabs value={createMode} onValueChange={(v) => setCreateMode(v as "account" | "note")}>
            <TabsList className="w-full">
              <TabsTrigger value="note" className="flex-1">客户资料</TabsTrigger>
              <TabsTrigger value="account" className="flex-1">真实账号</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="space-y-4">
            {/* 归属项目 */}
            <div className="space-y-2">
              <Label>归属项目 *</Label>
              <ProjectSelector
                value={form.projectId}
                onChange={(v) => setForm((f) => ({ ...f, projectId: v }))}
                token={getStoredAdminToken() ?? ""}
              />
            </div>

            {/* 账号名称 */}
            <div className="space-y-2">
              <Label>{createMode === "account" ? "账号名称 *" : "名称 *"}</Label>
              <Input
                className="h-10 focus-visible:border-foreground/30 focus-visible:ring-1 focus-visible:ring-foreground/10"
                value={form.accountName}
                onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                placeholder={createMode === "account" ? "如：某知识付费 IP" : "如：张总 / 某客户名"}
              />
            </div>

            {/* 真实账号专属字段 */}
            {createMode === "account" && (
              <>
                <div className="space-y-2">
                  <Label>平台 *</Label>
                  <Select value={form.platform} onValueChange={(v) => setForm((f) => ({ ...f, platform: v ?? "" }))}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="选择平台" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>主页链接</Label>
                  <Input
                    className="h-10"
                    value={form.accountUrl}
                    onChange={(e) => setForm((f) => ({ ...f, accountUrl: e.target.value }))}
                    placeholder="https://..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>粉丝数</Label>
                  <Input
                    className="h-10"
                    type="number"
                    value={form.followerCount}
                    onChange={(e) => setForm((f) => ({ ...f, followerCount: e.target.value }))}
                    placeholder="如：120000"
                  />
                </div>
              </>
            )}

            {/* 客户资料模式：粘贴 + 上传 */}
            {createMode === "note" && (
              <>
                <div className="space-y-2">
                  <Label>聊天框 / 文字资料</Label>
                  <textarea
                    className="min-h-40 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-foreground/30 focus-visible:ring-1 focus-visible:ring-foreground/10"
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    placeholder="把微信聊天记录、客户问答、Markdown 文档内容直接粘贴到这里..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>上传文字文件</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.markdown,.pdf,.docx,.xlsx,.csv"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                  />
                  <button
                    type="button"
                    className={cn(
                      "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-5 text-center transition-colors",
                      isDraggingFile
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 bg-muted/40 hover:border-primary/50 hover:bg-muted/60",
                      importingFiles ? "cursor-wait opacity-70" : "cursor-pointer"
                    )}
                    onClick={triggerFilePicker}
                    disabled={importingFiles}
                  >
                    {importingFiles ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : (
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-sm font-medium">
                      {importingFiles ? "正在解析文件" : "点击选择，或直接拖进这个弹窗"}
                    </span>
                    <span className="text-xs text-muted-foreground">{supportedFileText}</span>
                  </button>
                  {importedFiles.length > 0 && (
                    <div className="space-y-2">
                      {importedFiles.map((file, index) => (
                        <div
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{file.name}</span>
                          <button
                            type="button"
                            className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            onClick={() => removeImportedFile(index)}
                            aria-label={`移除 ${file.name}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 备注（可选） */}
            <div className="space-y-2">
              <Label>备注（可选）</Label>
              <Input
                className="h-10"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="内部备注..."
              />
            </div>

            {/* 去重提示 */}
            {duplicateNotice && (
              <p className="text-sm text-amber-600 bg-amber-50 rounded-md px-3 py-2">{duplicateNotice}</p>
            )}

            {createError ? (
              <p className="text-sm text-destructive">{createError}</p>
            ) : null}
          </div>

          <DialogFooter className="-mx-5 -mb-5 rounded-b-xl bg-transparent px-5 py-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={creating || importingFiles}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  创建中
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  创建
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
