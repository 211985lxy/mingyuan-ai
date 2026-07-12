"use client"

import { useAuthStore } from "@/lib/store"
import { getStoredAuthToken } from "@/lib/auth-storage"

class ApiError extends Error {
  status: number
  details: unknown

  constructor(message: string, status: number, details: unknown) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.details = details
  }
}

export function getApiErrorMessage(payload: unknown, status: number, statusText: string): string {
  if (typeof (payload as { error?: unknown } | null)?.error === "string") {
    const error = (payload as { error: string }).error
    if (/<html[\s>]/i.test(error) || /504 Gateway Time-?out/i.test(error)) {
      return "AI 服务响应超时，请稍后重试"
    }
    return error
  }
  return statusText ? `${status} ${statusText}` : `Request failed: ${status}`
}

type RequestOptions = RequestInit & { auth?: boolean; timeout?: number }

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, timeout, signal, ...init } = options
  const token = auth ? useAuthStore.getState().token || getStoredAuthToken() : null
  const controller = new AbortController()
  let abortedBySignal = false
  const abortFromSignal = () => { abortedBySignal = true; controller.abort() }
  if (signal?.aborted) abortFromSignal()
  else if (signal) signal.addEventListener("abort", abortFromSignal, { once: true })
  const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null
  try {
    const response = await fetch(path, { ...init, signal: controller.signal, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers ?? {}) } })
    if (timeoutId) clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", abortFromSignal)
    const text = await response.text().catch(() => "")
    const payload = text ? (() => { try { return JSON.parse(text) as unknown } catch { return { error: text } } })() : null
    if (!response.ok) {
      if (response.status === 401) useAuthStore.getState().clearSession()
      throw new ApiError(getApiErrorMessage(payload, response.status, response.statusText), response.status, payload)
    }
    return payload as T
  } catch (error) {
    if (timeoutId) clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", abortFromSignal)
    if (error instanceof Error && error.name === "AbortError") {
      if (abortedBySignal) throw new ApiError("请求已停止", 499, { code: "ABORTED", originalPath: path })
      throw new ApiError("请求超时，请检查网络连接或稍后重试", 408, { code: "TIMEOUT", originalPath: path })
    }
    throw error
  }
}

export { ApiError }
