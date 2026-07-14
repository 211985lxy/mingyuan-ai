"use client"

import { useAdminStore } from "@/lib/admin-store"

class AdminApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.name = "AdminApiError"
    this.status = status
    this.details = details
  }
}

type RequestOptions = RequestInit & {
  auth?: boolean
  /** 请求超时（毫秒），默认 20s。设为 0 表示不超时（仅长任务用）。 */
  timeoutMs?: number
}

/** 默认请求超时。后台绝大多数接口都是 DB 查询，20s 足够；蒸馏/上传等长任务由各调用方覆盖。 */
const DEFAULT_TIMEOUT_MS = 20000

function startTimeout(controller: AbortController | null, timeoutMs: number) {
  if (!controller || timeoutMs <= 0) return null
  return globalThis.setTimeout(() => controller.abort(), timeoutMs)
}

function stopTimeout(timer: ReturnType<typeof globalThis.setTimeout> | null) {
  if (timer) globalThis.clearTimeout(timer)
}

function handleAdminUnauthorized() {
  useAdminStore.getState().clearSession()

  if (typeof window !== "undefined" && window.location.pathname !== "/admin/login") {
    window.location.replace("/admin/login")
  }
}

/** 从后端返回体中提取可读的错误信息，兼容多种 error 字段写法。 */
function extractErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback
  const p = payload as Record<string, unknown>
  if (typeof p.error === "string") return p.error
  if (typeof p.message === "string") return p.message
  if (p.error && typeof p.error === "object") {
    const inner = (p.error as Record<string, unknown>).message
    if (typeof inner === "string") return inner
  }
  return fallback
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, timeoutMs = DEFAULT_TIMEOUT_MS, ...init } = options
  const controller = timeoutMs > 0 ? new AbortController() : null
  const timer = startTimeout(controller, timeoutMs)

  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      signal: controller ? controller.signal : init.signal,
      headers: {
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
    })
  } catch (err) {
    // 网络错误（断网/DNS/CORS）或超时（abort）——统一归一化为 AdminApiError，
    // 否则 fetch 抛出的 TypeError 会绕过调用方的 instanceof 判断，错误信息被吞。
    stopTimeout(timer)
    const aborted = err instanceof DOMException && err.name === "AbortError"
    throw new AdminApiError(
      aborted ? "请求超时，请检查网络后重试" : "网络连接失败，请检查网络后重试",
      0,
      { cause: String(err) }
    )
  } finally {
    stopTimeout(timer)
  }

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && auth) {
      handleAdminUnauthorized()
    }
    throw new AdminApiError(
      extractErrorMessage(payload, `Request failed: ${response.status}`),
      response.status,
      payload
    )
  }

  return payload as T
}

export { AdminApiError }

// ─── Auth ────────────────────────────────────────────────

export async function adminLogin(email: string, password: string) {
  return request<{ admin: { id: string; email: string; name: string; role: string } }>(
    "/api/admin/auth/login",
    { auth: false, method: "POST", body: JSON.stringify({ email, password }) }
  )
}

export async function getCurrentAdmin() {
  return request<{ admin: { id: string; email: string; name: string; role: string } }>(
    "/api/admin/auth/me",
  )
}

export async function adminLogout(): Promise<void> {
  await request<{ ok: true }>("/api/admin/auth/logout", { method: "POST" })
}

// ─── Users ───────────────────────────────────────────────

export async function getAdminUsers(params: { page?: number; pageSize?: number; search?: string; plan?: string }) {
  const qs = new URLSearchParams()
  if (params.page) qs.set("page", String(params.page))
  if (params.pageSize) qs.set("pageSize", String(params.pageSize))
  if (params.search) qs.set("search", params.search)
  if (params.plan) qs.set("plan", params.plan)
  return request<{ data: { results: AdminUserItem[]; total: number; page: number; pageSize: number } }>(
    `/api/admin/users?${qs}`
  )
}

export async function getAdminUserDetail(id: string) {
  return request<{ data: AdminUserDetail }>(`/api/admin/users/${id}`)
}

export async function getAdminUserStats() {
  return request<{ data: UserStats }>("/api/admin/users/stats")
}

// ─── Activation Codes ────────────────────────────────────

export async function generateActivationCodes(
  quantity: number,
  durationDays: number,
  batchNote?: string
) {
  return request<{ data: { count: number; batchId: string; durationDays: number } }>(
    "/api/admin/activation-codes/generate",
    { method: "POST", body: JSON.stringify({ quantity, durationDays, batchNote }) }
  )
}

export async function getActivationCodes(params: { page?: number; pageSize?: number; status?: string; batchId?: string }) {
  const qs = new URLSearchParams()
  if (params.page) qs.set("page", String(params.page))
  if (params.pageSize) qs.set("pageSize", String(params.pageSize))
  if (params.status) qs.set("status", params.status)
  if (params.batchId) qs.set("batchId", params.batchId)
  return request<{ data: { results: ActivationCodeItem[]; total: number; page: number; pageSize: number; batches: string[] } }>(
    `/api/admin/activation-codes?${qs}`
  )
}

export async function getActivationCodeStats() {
  return request<{ data: CodeStats }>("/api/admin/activation-codes/stats")
}

export function getActivationCodesExportUrl(params: { status?: string; batchId?: string }) {
  const qs = new URLSearchParams()
  if (params.status) qs.set("status", params.status)
  if (params.batchId) qs.set("batchId", params.batchId)
  return `/api/admin/activation-codes/export?${qs}`
}

export async function downloadActivationCodesExport(params: { status?: string; batchId?: string }) {
  const controller = new AbortController()
  const timer = startTimeout(controller, DEFAULT_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(getActivationCodesExportUrl(params), {
      credentials: "same-origin",
      signal: controller.signal,
    })
  } catch (err) {
    stopTimeout(timer)
    const aborted = err instanceof DOMException && err.name === "AbortError"
    throw new AdminApiError(
      aborted ? "导出超时，请重试" : "网络连接失败，请检查网络后重试",
      0,
      { cause: String(err) }
    )
  } finally {
    stopTimeout(timer)
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null)

    if (response.status === 401) {
      handleAdminUnauthorized()
    }

    throw new AdminApiError(
      extractErrorMessage(payload, `Request failed: ${response.status}`),
      response.status,
      payload
    )
  }

  const blob = await response.blob()
  const disposition = response.headers.get("content-disposition") || ""
  const match = disposition.match(/filename=\"?([^"]+)\"?/)

  return {
    blob,
    fileName: match?.[1] ?? `activation-codes-${Date.now()}.csv`,
  }
}

// ─── Settings ────────────────────────────────────────────

export async function getAdminSettings() {
  return request<{ data: Record<string, SettingItem[]> }>("/api/admin/settings")
}

export async function updateAdminSetting(key: string, value: string) {
  return request<{ data: SettingItem }>(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value }),
  })
}

export async function createAdminSetting(input: { key: string; value: string; type: string; category: string; description?: string }) {
  return request<{ data: SettingItem }>("/api/admin/settings", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

export async function getAdminHotSources() {
  return request<{ data: AdminHotSourceItem[] }>("/api/admin/hot-sources")
}

export async function saveAdminHotSource(input: AdminHotSourceInput) {
  return request<{ data: SettingItem }>("/api/admin/hot-sources", {
    method: "POST",
    body: JSON.stringify(input),
  })
}

// ─── Types ───────────────────────────────────────────────

export interface AdminUserItem {
  id: string
  email: string
  name: string
  plan: string
  createdAt: string
  _count: {
    videoTasks: number
    avatars: number
    assets: number
  }
}

export interface AdminUserDetail {
  id: string
  email: string
  name: string
  plan: string
  createdAt: string
  updatedAt: string
  ipProfile: {
    displayName: string | null
    industry: string | null
    isComplete: boolean
  } | null
  videoTasks: {
    id: string
    status: string
    videoType: string
    avatarName: string
    createdAt: string
    completedAt: string | null
  }[]
  avatars: {
    id: string
    name: string
    status: string
    createdAt: string
  }[]
  assets: {
    id: string
    name: string
    assetType: string
    createdAt: string
  }[]
  _count: {
    videoTasks: number
    avatars: number
    assets: number
    scripts: number
  }
}

export interface UserStats {
  total: number
  byPlan: { plan: string; count: number }[]
  newThisWeek: number
}

export interface ActivationCodeItem {
  id: string
  code: string
  batchId: string
  batchNote: string | null
  durationDays: number
  status: string
  usedAt: string | null
  createdAt: string
  user: { email: string; name: string } | null
}

export interface CodeStats {
  total: number
  unused: number
  used: number
  usageRate: number
}

export interface SettingItem {
  id: string
  key: string
  value: string
  type: string
  category: string
  description: string | null
  updatedBy: string | null
  updatedAt: string
}

export interface AdminHotSourceItem {
  key: string
  email: string
  sourceName: string
  sourceUrl: string
  sourceType: string
  enabled: boolean
  note: string
  isBuiltIn: boolean
  updatedAt: string | null
}

export interface AdminHotSourceInput {
  email: string
  sourceName: string
  sourceUrl: string
  sourceType?: string
  enabled: boolean
  note?: string
}
