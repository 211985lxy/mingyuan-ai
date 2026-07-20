"use client"

import React, { useLayoutEffect, useRef, useState } from "react"

interface CollapsibleContentProps {
  /** 内容渲染函数，接收一个 ref 让组件测量实际高度 */
  children: React.ReactNode
  /** 折叠时的最大高度（像素），超出则显示展开按钮。默认约 12 行（336px） */
  collapsedMaxHeight?: number
  /** 外层 className */
  className?: string
}

/**
 * 长文折叠容器：内容超过阈值高度时自动折叠，底部渐变遮罩 + 展开/收起按钮。
 * 用 ref 实测高度判断是否可折叠，避免对纯文本长度的猜测（渲染后才能确定真实高度）。
 */
/**
 * @description collapsiblecontent
 * @param options - 配置选项
 * @returns 无返回值
 */
export function CollapsibleContent({
  children,
  collapsedMaxHeight = 336,
  className = "",
}: CollapsibleContentProps) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [collapsible, setCollapsible] = useState(false)

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    // 实测内容高度，判断是否需要折叠
    const isOverflowing = el.scrollHeight > collapsedMaxHeight + 4
    setCollapsible(isOverflowing)
    if (!isOverflowing) setExpanded(false)
  }, [children, collapsedMaxHeight])

  const showToggle = collapsible
  const isCollapsed = showToggle && !expanded

  return (
    <div className={className}>
      <div
        ref={innerRef}
        className="relative overflow-hidden transition-[max-height] duration-200"
        style={{ maxHeight: isCollapsed ? `${collapsedMaxHeight}px` : undefined }}
      >
        {children}
        {/* 折叠态底部渐变遮罩，提示还有更多内容 */}
        {isCollapsed ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-background to-transparent" />
        ) : null}
      </div>
      {showToggle ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {expanded ? "收起 ▲" : "展开全文 ▼"}
        </button>
      ) : null}
    </div>
  )
}
