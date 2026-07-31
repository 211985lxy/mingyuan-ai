"use client"

import { create } from "zustand"
import { deleteAimHistory, listAimHistory, type AimGeneration } from "@/lib/api/client"

interface FetchHistoryOpts {
  /** 按全案过滤；不传则不按全案过滤 */
  projectId?: string
  /** 按智能体过滤；侧栏按专家分组时不传，取全局最近再客户端分组 */
  agentId?: string
  /** 强制刷新，跳过节流 */
  force?: boolean
}

interface AimWorkspaceState {
  /** 最近生成记录，供侧边栏按专家分组渲染「最近任务」 */
  history: AimGeneration[]
  /** 当前 history 对应的智能体过滤；null = 全局最近 */
  historyAgentId: string | null
  isLoading: boolean
  /** 上次成功拉取时间戳，用于节流 */
  lastFetchAt: number
  /** 待加载进对话的历史记录 id（侧边栏点击后设置，工作台页面消费后清空） */
  loadTargetId: string | null
  /** 侧栏「新建文案」：工作台消费后清空对话并进入内容创作官空会话 */
  pendingNewCopy: boolean
  fetchHistory: (opts?: FetchHistoryOpts) => Promise<void>
  deleteHistory: (id: string) => Promise<void>
  requestLoad: (id: string) => void
  clearLoadTarget: () => void
  requestNewCopy: () => void
  clearNewCopyRequest: () => void
}

const HISTORY_THROTTLE_MS = 2000
const HISTORY_PAGE_SIZE = 50

function sameFilter(current: string | null, next: string | undefined) {
  return (current ?? null) === (next ?? null)
}

export const useAimWorkspaceStore = create<AimWorkspaceState>()((set, get) => ({
  history: [],
  historyAgentId: null,
  isLoading: false,
  lastFetchAt: 0,
  loadTargetId: null,
  pendingNewCopy: false,

  fetchHistory: async (opts) => {
    if (get().isLoading) return
    const nextAgentId = opts?.agentId ?? null
    const filterUnchanged = sameFilter(get().historyAgentId, opts?.agentId)
    // 非强制时：同过滤条件 + 2s 内且已有数据 → 跳过
    if (
      !opts?.force
      && filterUnchanged
      && get().history.length > 0
      && Date.now() - get().lastFetchAt < HISTORY_THROTTLE_MS
    ) {
      return
    }
    // 过滤条件变化时先清空，避免短暂串台
    if (!filterUnchanged) {
      set({ history: [], historyAgentId: nextAgentId, isLoading: true })
    } else {
      set({ isLoading: true })
    }
    try {
      const data = await listAimHistory(1, HISTORY_PAGE_SIZE, opts?.projectId, opts?.agentId)
      set({
        history: data,
        historyAgentId: nextAgentId,
        lastFetchAt: Date.now(),
      })
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

  requestLoad: (id) => set({ loadTargetId: id, pendingNewCopy: false }),
  clearLoadTarget: () => set({ loadTargetId: null }),
  requestNewCopy: () => set({ pendingNewCopy: true, loadTargetId: null }),
  clearNewCopyRequest: () => set({ pendingNewCopy: false }),
}))
