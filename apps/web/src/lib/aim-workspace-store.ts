"use client"

import { create } from "zustand"
import { deleteAimHistory, listAimHistory, type AimGeneration } from "@/lib/api/client"

interface FetchHistoryOpts {
  /** 按全案过滤；不传则取全局最近 */
  projectId?: string
  /** 按智能体过滤；不传则取全局最近 */
  agentId?: string
  /** 强制刷新，跳过节流 */
  force?: boolean
}

interface AimWorkspaceState {
  /** 最近生成记录，供侧边栏「最近内容」渲染 */
  history: AimGeneration[]
  isLoading: boolean
  /** 上次成功拉取时间戳，用于节流 */
  lastFetchAt: number
  /** 待加载进对话的历史记录 id（侧边栏点击后设置，工作台页面消费后清空） */
  loadTargetId: string | null
  fetchHistory: (opts?: FetchHistoryOpts) => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  requestLoad: (id: string) => void
  clearLoadTarget: () => void
}

const HISTORY_THROTTLE_MS = 2000

export const useAimWorkspaceStore = create<AimWorkspaceState>()((set, get) => ({
  history: [],
  isLoading: false,
  lastFetchAt: 0,
  loadTargetId: null,

  fetchHistory: async (opts) => {
    if (get().isLoading) return
    // 非强制时，2s 内且已有数据则跳过，避免重复请求
    if (!opts?.force && get().history.length > 0 && Date.now() - get().lastFetchAt < HISTORY_THROTTLE_MS) {
      return
    }
    set({ isLoading: true })
    try {
      const data = await listAimHistory(1, 50, opts?.projectId, opts?.agentId)
      set({ history: data, lastFetchAt: Date.now() })
    } catch {
      // 静默失败；调用方各自决定是否 toast
    } finally {
      set({ isLoading: false })
    }
  },

  deleteHistory: async (id) => {
    await deleteAimHistory(id)
    set((state) => ({
      history: state.history.filter((item) => item.id !== id),
      loadTargetId: state.loadTargetId === id ? null : state.loadTargetId,
    }))
  },

  requestLoad: (id) => set({ loadTargetId: id }),
  clearLoadTarget: () => set({ loadTargetId: null }),
}))
