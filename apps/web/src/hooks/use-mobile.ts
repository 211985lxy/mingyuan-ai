import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * @description 检测当前设备是否为移动端（基于 768px 断点）
 * @returns 当前是否为移动端视图
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    
    // 异步更新以防止在 effect 顶级作用域中同步 setState
    const timer = setTimeout(() => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }, 0)

    return () => {
      mql.removeEventListener("change", onChange)
      clearTimeout(timer)
    }
  }, [])

  return !!isMobile
}
