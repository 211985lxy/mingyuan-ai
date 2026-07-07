import { Skeleton } from "@/components/ui/skeleton"

/**
 * 后台路由级加载态。在加载子页面 chunk 或服务端渲染时显示，避免白屏。
 * 与各页面的"数据加载"骨架互补：这里覆盖的是路由切换/JS 加载阶段。
 */
export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    </div>
  )
}
