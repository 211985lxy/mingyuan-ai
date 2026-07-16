export const PLATFORM_LABELS: Record<string, string> = {
  douyin: "抖音",
  xiaohongshu: "小红书",
  bilibili: "B站",
  kuaishou: "快手",
}

export const PLATFORM_COLORS: Record<string, string> = {
  douyin: "bg-pink-50 text-pink-700 border-pink-200",
  xiaohongshu: "bg-red-50 text-red-700 border-red-200",
  bilibili: "bg-blue-50 text-blue-700 border-blue-200",
  kuaishou: "bg-orange-50 text-orange-700 border-orange-200",
}

export const KIND_LABELS: Record<string, string> = {
  note: "笔记",
  report: "诊断报告",
  copy_extraction: "文案提取",
  video: "爆款样本",
  account_pool: "账号池",
  structure_asset: "结构资产",
  topic_candidates: "选题池",
}

export const KIND_COLORS: Record<string, string> = {
  note: "bg-gray-100 text-gray-600",
  report: "bg-indigo-50 text-indigo-600",
  copy_extraction: "bg-amber-50 text-amber-600",
  video: "bg-emerald-50 text-emerald-600",
  account_pool: "bg-violet-50 text-violet-600",
  structure_asset: "bg-fuchsia-50 text-fuchsia-600",
  topic_candidates: "bg-orange-50 text-orange-600",
}

export interface ProfileListItem {
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

export interface ImportedFile {
  name: string
  text: string
}

export interface BenchmarkProfileForm {
  content: string
  accountName: string
  platform: string
  accountUrl: string
  followerCount: string
  projectId: string
  notes: string
}

export interface ProfileItem {
  id: string
  kind: string
  title: string
  content: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ProfileDetail {
  id: string
  name: string
  platform: string
  accountUrl: string | null
  platformUserId: string | null
  followerCount: number | null
  personaTags: unknown
  positioning: string | null
  differentiator: string | null
  takeaways: string | null
  competitorAnalysisId: string | null
  notes: string | null
  status: string
  createdAt: string
  updatedAt: string
  project: { id: string; name: string; companyName: string | null; industry: string | null } | null
  user: { id: string; name: string | null; email: string } | null
  items: ProfileItem[]
}

export interface ImportableAnalysis {
  id: string
  targetUrl: string | null
  platform: string | null
  accountName: string | null
  overallScore: number | null
  status: string
  createdAt: string
  userId: string
  user: { email: string | null; name: string | null } | null
}

export interface EditableProfileItem {
  id: string
  title: string
  content: string
  kind: string
}

export function formatFollowerCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万粉丝`
  return `${value}粉丝`
}
