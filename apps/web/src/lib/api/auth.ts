"use client"

import { ApiError, getApiErrorMessage, request } from "./core"
import { useAuthStore } from "@/lib/store"
import type { HotTopic } from "@/types/content-template"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type {
  ApiAsset, ApiContentGenerationRun, ApiHotTopicFit, ApiHotTopicInsight,
  ApiTopicRecommendationMode, ApiScript, ApiUser,
  ApiVideoStructure,
  AuthResponse,
  HotTopicsResponse, PaginatedResponse,
  PublicTemplateDetail, PublicTemplateListItem, ApiTopicGenerateResponse, ApiTopicSelectResponse,
  ApiOpeningType, ApiCopyStructure, ApiEndingType, ApiCompetitorAnalysis,
  CompetitorReportsResponse, ApiCompetitorWebResearch, ApiAccountHotSources,
  ApiAiHotBriefing, ApiHotDecisionResponse, ApiHotDecisionSource, ApiMarketHotSnapshot,
  ApiVideoCopyExtraction, ApiAgentApiKeySummary, ApiTopicCard,
} from "@/types/api"

/**
 * @description 用户登录
 * @param email - 邮箱
 * @param password - 密码
 * @returns 认证响应
 */
export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/login", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
}

/**
 * @description 发送手机登录验证码
 * @param phone - 手机号
 * @returns 发送结果（含重试间隔）
 */
export async function sendSmsLoginCode(phone: string): Promise<{ sent: boolean; retryAfterSeconds: number }> {
  return request<{ sent: boolean; retryAfterSeconds: number }>("/api/auth/sms/send", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ phone }),
  })
}

/**
 * @description 手机号验证码登录
 * @param phone - 手机号
 * @param code - 6 位验证码
 * @returns 认证响应
 */
export async function loginUserBySms(phone: string, code: string): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/sms/login", {
    auth: false,
    method: "POST",
    body: JSON.stringify({ phone, code }),
  })
}

/**
 * @description 开发环境快捷登录
 * @returns 认证响应
 */
export async function devLoginUser(): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/dev-login", {
    auth: false,
    method: "POST",
  })
}

/**
 * @description 用户注册
 * @param input - 注册信息（邮箱、密码、姓名）
 * @returns 认证响应
 */
export async function registerUser(input: {
  email: string
  password: string
  name: string
}): Promise<AuthResponse> {
  return request<AuthResponse>("/api/auth/register", {
    auth: false,
    method: "POST",
    body: JSON.stringify(input),
  })
}

/**
 * @description 获取当前登录用户信息
 * @returns 用户信息
 */
export async function getCurrentUser(): Promise<ApiUser> {
  const payload = await request<{ user: ApiUser }>("/api/auth/me")
  return payload.user
}

/**
 * @description 用户登出
 * @returns 无返回值
 */
export async function logoutUser(): Promise<void> {
  await request<{ ok: true }>("/api/auth/logout", { method: "POST" })
}

/**
 * @description 获取 Agent API Key 列表
 * @returns API Key 摘要数组
 */
export async function listAgentApiKeys(): Promise<ApiAgentApiKeySummary[]> {
  const payload = await request<{ items: ApiAgentApiKeySummary[] }>("/api/account/agent-keys")
  return payload.items
}

/**
 * @description 获取账号热点来源配置
 * @returns 热点来源配置
 */
export async function getAccountHotSources(): Promise<ApiAccountHotSources> {
  const payload = await request<{ data: ApiAccountHotSources }>("/api/account/hot-sources")
  return payload.data
}

/**
 * @description 激活用户账号
 * @param code - 激活码
 * @returns 激活后的用户信息
 */
export async function activateUser(code: string): Promise<ApiUser> {
  const payload = await request<{ user: ApiUser }>("/api/auth/activate", {
    method: "POST",
    body: JSON.stringify({ code }),
  })
  return payload.user
}
