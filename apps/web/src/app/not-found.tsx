import { RouteNotFoundState } from "@/components/layout/route-states"

/** 全局 404：未匹配任何路由时的品牌化出口（含营销页误输地址的情况）。 */
export default function GlobalNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <RouteNotFoundState />
    </div>
  )
}
