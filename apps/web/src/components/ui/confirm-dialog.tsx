"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface ConfirmOptions {
  title: string
  description?: string
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string
  cancelText?: string
  /** 破坏性操作（删除/重置/丢弃）：确认按钮转为警示色 */
  destructive?: boolean
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

/**
 * 无 Provider 时的降级实现：仍会询问用户，只是退回原生弹窗。
 * 不选择抛错——组件会被独立渲染（测试、局部复用），抛错会让整棵子树崩溃；
 * 也不选择静默通过，否则危险操作会未经确认直接执行。
 */
const fallbackConfirm: ConfirmFn = async (options) => {
  if (typeof window === "undefined") return false
  const text = options.description ? `${options.title}\n\n${options.description}` : options.title
  return window.confirm(text)
}

const ConfirmContext = createContext<ConfirmFn>(fallbackConfirm)

/**
 * 品牌化确认对话框：替代 window.confirm。
 *
 * 原生 confirm 样式随浏览器变化、无法定制，在品牌化界面里是最突兀的
 * 体验断裂点，且不支持异步流程。这里提供 Promise 化的 confirm()，
 * 调用处写法与原生几乎一致：`if (!(await confirm({...}))) return`。
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((next) => {
    // 上一条未决的确认（异常路径）直接按取消处理，避免悬挂
    resolveRef.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolveRef.current?.(value)
    resolveRef.current = null
    setOptions(null)
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog open={options !== null} onOpenChange={(open) => !open && settle(false)}>
        <DialogContent className="sm:max-w-sm" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{options?.title}</DialogTitle>
            {options?.description ? (
              <DialogDescription>{options.description}</DialogDescription>
            ) : null}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => settle(false)}>
              {options?.cancelText ?? "取消"}
            </Button>
            <Button
              variant={options?.destructive ? "destructive" : "default"}
              onClick={() => settle(true)}
            >
              {options?.confirmText ?? "确定"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}

/** 取用确认函数；无 ConfirmProvider 时自动降级为原生确认。 */
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext)
}
