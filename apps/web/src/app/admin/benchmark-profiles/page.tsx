"use client"

import React from "react"
import { Plus, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CreateProfileDialog } from "@/features/benchmark-profiles/components/create-profile-dialog"
import { BenchmarkProfileList } from "@/features/benchmark-profiles/components/profile-list"
import { PLATFORM_LABELS, type BenchmarkProfileForm, type ImportedFile, type ProfileListItem } from "@/features/benchmark-profiles/model"
import { getStoredAdminToken } from "@/lib/admin-store"

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
  const [form, setForm] = React.useState<BenchmarkProfileForm>({
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

      <BenchmarkProfileList
        loading={loading}
        profiles={profiles}
        status={statusTab}
        page={page}
        total={total}
        totalPages={totalPages}
        onCreate={() => setCreateOpen(true)}
        onRestore={handleRestore}
        onPageChange={setPage}
      />

      <CreateProfileDialog
        open={createOpen}
        mode={createMode}
        form={form}
        creating={creating}
        error={createError}
        duplicateNotice={duplicateNotice}
        importingFiles={importingFiles}
        isDraggingFile={isDraggingFile}
        importedFiles={importedFiles}
        fileInputRef={fileInputRef}
        token={getStoredAdminToken() ?? ""}
        onOpenChange={handleDialogOpenChange}
        onModeChange={setCreateMode}
        setForm={setForm}
        onCreate={handleCreate}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onFileUpload={handleFileUpload}
        onPickFile={triggerFilePicker}
        onRemoveFile={removeImportedFile}
      />
    </div>
  )
}
