import { cn } from "@/lib/utils"

/**
 * 骨架屏：用规范 三.1 的水墨宣纸流光（.dao-shimmer）替代通用 pulse——
 * 一道金光缓缓扫过，比明暗闪烁更贴品牌气质。
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("dao-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
