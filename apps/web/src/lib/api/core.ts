"use client"

import { useAuthStore } from "@/lib/store"

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

/**
 * @description 获取apierrormessage
 * @param payload - payload
 * @param status - 状态
 * @param statusText - 状态文本
 * @returns string
 */
export function getApiErrorMessage(payload: unknown, status: number, statusText: string): string {
  if (typeof (payload as { error?: unknown } | null)?.error === "string") {
    const error = (payload as { error: string }).error
    if (status === 401 && ["Invalid token", "Unauthorized", "User not found"].includes(error)) {
      return "登录状态已失效，请重新登录"
    }
    if (/<html[\s>]/i.test(error) || /504 Gateway Time-?out/i.test(error)) {
      return "AI 服务响应超时，请稍后重试"
    }
    return error
  }
  return statusText ? `${status} ${statusText}` : `Request failed: ${status}`
}

type RequestOptions = RequestInit & { auth?: boolean; timeout?: number }

/**
 * @description request
 * @param path - 路径
 * @param options - 配置选项
 * @returns Promise<T>
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, timeout, signal, ...init } = options
  const controller = new AbortController()
  let abortedBySignal = false
  const abortFromSignal = () => { abortedBySignal = true; controller.abort() }
  if (signal?.aborted) abortFromSignal()
  else if (signal) signal.addEventListener("abort", abortFromSignal, { once: true })
  const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : null
  try {
    const response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(headers ?? {}) },
    })
    if (timeoutId) clearTimeout(timeoutId)
    if (signal) signal.removeEventListener("abort", abortFromSignal)
    const text = await response.text().catch(() => "")
    const payload = text ? (() => { try { return JSON.parse(text) as unknown } catch { return { error: text } } })() : null
    if (!response.ok) {
      if (response.status === 401 && auth) useAuthStore.getState().clearSession()
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
