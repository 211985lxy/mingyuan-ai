"use client"

import { useCallback, useEffect, useState } from "react"

/** 抖音授权回跳时带在 URL 上的一次性参数 */
export type DouyinSyncOkState = {
  nickname?: string
  fans?: string
  videosCount?: string
  larkAccounts?: string
  larkVideos?: string
}

const CALLBACK_KEYS = [
  "douyin_ok",
  "nickname",
  "fans",
  "videos_count",
  "lark_accounts",
  "lark_videos",
  "douyin_error",
]

/** 消费后从地址栏清掉回跳参数，避免刷新重复提示或残留脏 URL。 */
function stripCallbackParams() {
  const sp = new URLSearchParams(window.location.search)
  CALLBACK_KEYS.forEach((key) => sp.delete(key))
  const query = sp.toString()
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
  )
}

/**
 * 读取抖音授权回跳参数（douyin_ok / douyin_error），一次性消费并清理地址栏。
 * 发起页与回调落地页需为同一页面，提示才可见——由 /api/integrations/douyin/auth
 * 的 ?return= 保证。
 */
export function useDouyinSyncAlert() {
  const [okState, setOkState] = useState<DouyinSyncOkState | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const sp = new URLSearchParams(window.location.search)
    const ok = sp.get("douyin_ok")
    const err = sp.get("douyin_error")

    if (ok === "1") {
      // 挂载后一次性消费回跳参数：同步置态属预期的挂载期行为（仓库惯例 warn 放行）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOkState({
        nickname: sp.get("nickname") ? decodeURIComponent(sp.get("nickname")!) : undefined,
        fans: sp.get("fans") || undefined,
        videosCount: sp.get("videos_count") || undefined,
        larkAccounts: sp.get("lark_accounts") || undefined,
        larkVideos: sp.get("lark_videos") || undefined,
      })
    }
    if (err) {
      try {
        setErrorMsg(decodeURIComponent(err))
      } catch {
        setErrorMsg(err)
      }
    }
    if (ok === "1" || err) stripCallbackParams()
  }, [])

  const clear = useCallback(() => {
    setOkState(null)
    setErrorMsg(null)
  }, [])

  return { okState, errorMsg, clear, hasAlert: Boolean(okState || errorMsg) }
}

/** 绑定结果提示：成功展示同步数量，失败展示服务端真实原因。 */
export function DouyinSyncAlert({
  okState,
  errorMsg,
}: {
  okState: DouyinSyncOkState | null
  errorMsg: string | null
}) {
  return (
    <>
      {okState ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
          <div className="font-medium text-emerald-700 dark:text-emerald-400">
            {okState.nickname ? `已同步：${okState.nickname}` : "抖音账号同步成功"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            粉丝 {okState.fans ?? "—"} · 拉取视频 {okState.videosCount ?? 0} 条
            {okState.larkAccounts ? ` · 飞书账号表写入 ${okState.larkAccounts}` : ""}
            {okState.larkVideos ? ` · 飞书视频表写入 ${okState.larkVideos}` : ""}
          </div>
        </div>
      ) : null}
      {errorMsg ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-medium text-destructive">抖音同步失败</div>
          <div className="mt-1 text-xs text-muted-foreground">{errorMsg}</div>
        </div>
      ) : null}
    </>
  )
}
