import type { KeyboardEvent } from "react"

/**
 * 给非交互元素（div/span 等）补上「可点击」的语义与键盘支持。
 *
 * 仅用 onClick 的原生 div 无法被 Tab 聚焦、也无法用 Enter/Space 触发，
 * 键盘与读屏用户完全无法操作。传入 undefined 时返回空对象，元素保持纯展示。
 *
 * 用法：`<div {...clickableProps(handler)}>`
 */
export function clickableProps(onActivate?: (() => void) | undefined) {
  if (!onActivate) return {}
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault()
        onActivate()
      }
    },
  }
}
