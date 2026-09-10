"use client"

import { AdminApiError } from "./admin-client"

/**
 * Prompt 资产管理客户端（/admin/prompts 管理界面专用）。
 * 服务端契约见 src/app/api/admin/prompts/**；鉴权走 admin 会话 cookie。
 */

export interface AdminPromptVersion {
  id: string
  version: number
  status: "draft" | "qualified" | "active"
  type: string
  fixtureKey: string | null
  createdAt: string
  contentPreview: string
  contentLength: number
}

export interface AdminPromptTemplate {
  key: string
  domain: string
  description: string | null
  versions: AdminPromptVersion[]
}

async function adminRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  const payload = (await response.json().catch(() => null)) as
    | { data?: T; error?: string }
    | null
  if (!response.ok) {
    throw new AdminApiError(
      payload?.error ?? `请求失败：${response.status}`,
      response.status,
      payload ?? undefined,
    )
  }
  return (payload?.data ?? (payload as unknown)) as T
}

/**
 * @description 列出全部 prompt 模板与版本
 */
export async function listAdminPrompts(): Promise<{ templates: AdminPromptTemplate[] }> {
  const response = await fetch("/api/admin/prompts", {
    method: "GET",
    credentials: "same-origin",
  })
  const payload = (await response.json().catch(() => null)) as
    | { data?: { templates: AdminPromptTemplate[] }; error?: string }
    | null
  if (!response.ok) {
    throw new AdminApiError(payload?.error ?? `请求失败：${response.status}`, response.status, payload)
  }
  return payload?.data ?? { templates: [] }
}

/**
 * @description 新建草稿版本（未登记 key 的首个版本需提供 domain）
 */
export function createAdminPromptDraft(input: {
  key: string
  content: string
  fixtureKey?: string
  domain?: string
  description?: string
}) {
  return adminRequest<{ id: string; key: string; version: number; status: string; fixtureKey: string | null }>(
    `/api/admin/prompts/${encodeURIComponent(input.key)}/versions`,
    {
      content: input.content,
      ...(input.fixtureKey ? { fixtureKey: input.fixtureKey } : {}),
      ...(input.domain ? { domain: input.domain } : {}),
      ...(input.description ? { description: input.description } : {}),
    },
  )
}

/**
 * @description 按门禁升级版本状态（qualified 需 fixtureKey；active 只能从 qualified）
 */
export function promoteAdminPromptVersion(input: {
  key: string
  version: number
  toStatus: "qualified" | "active"
}) {
  return adminRequest<{
    key: string
    version: number
    status: string
    demotedToQualified: number
  }>(`/api/admin/prompts/${encodeURIComponent(input.key)}/promote`, {
    version: input.version,
    toStatus: input.toStatus,
  })
}

export { AdminApiError }
