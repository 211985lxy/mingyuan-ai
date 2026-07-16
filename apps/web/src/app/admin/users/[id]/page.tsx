"use client"

import React from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import {
  ArrowLeft,
  Sparkles,
  ImageIcon,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { getAdminUserDetail, type AdminUserDetail } from "@/lib/api/admin-client"

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="h-3.5 w-3.5 text-green-600" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  pending: <Clock className="h-3.5 w-3.5 text-yellow-600" />,
  processing: <Clock className="h-3.5 w-3.5 text-blue-600" />,
}

export default function AdminUserDetailPage() {
  const params = useParams() ?? {}
  const [user, setUser] = React.useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    if (!params.id) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getAdminUserDetail(params.id as string)
      .then((res) => setUser(res.data))
      .catch((error) => {
        console.error(error)
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        未找到用户
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/admin/users">
          <Button variant="ghost" size="icon" className="cursor-pointer">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-2xl font-bold">{user.name}</h1>
        <Badge variant="secondary">{user.plan}</Badge>
      </div>

      {/* User Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">用户信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <InfoRow label="邮箱" value={user.email} />
            <InfoRow label="套餐" value={user.plan} />
            <InfoRow label="注册时间" value={new Date(user.createdAt).toLocaleString("zh-CN")} />
            <InfoRow label="更新时间" value={new Date(user.updatedAt).toLocaleString("zh-CN")} />
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="space-y-4">
          <StatMini icon={<Sparkles className="h-4 w-4" />} label="生成稿" value={user._count.aimGenerations} />
          <StatMini icon={<ImageIcon className="h-4 w-4" />} label="素材" value={user._count.assets} />
          <StatMini icon={<FileText className="h-4 w-4" />} label="脚本" value={user._count.scripts} />
        </div>
      </div>

      {/* IP Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">IP 档案</CardTitle>
        </CardHeader>
        <CardContent>
          {user.ipProfile ? (
            <div className="space-y-2">
              <InfoRow label="显示名称" value={user.ipProfile.displayName || "-"} />
              <InfoRow label="行业" value={user.ipProfile.industry || "-"} />
              <InfoRow
                label="完整度"
                value={user.ipProfile.isComplete ? "是" : "否"}
              />
            </div>
          ) : (
            <p className="text-muted-foreground">暂无 IP 档案</p>
          )}
        </CardContent>
      </Card>

      {/* Recent generations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            最近生成记录（共 {user._count.aimGenerations} 个）
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {user.aimGenerations.length === 0 ? (
            <p className="p-4 text-muted-foreground">暂无生成记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">状态</th>
                    <th className="text-left p-3 font-medium">智能体</th>
                    <th className="text-left p-3 font-medium">创建时间</th>
                  </tr>
                </thead>
                <tbody>
                  {user.aimGenerations.map((generation) => (
                    <tr key={generation.id} className="border-b">
                      <td className="p-3">
                        <span className="flex items-center gap-1.5">
                          {STATUS_ICONS[generation.status] || null}
                          {generation.status}
                        </span>
                      </td>
                      <td className="p-3 text-muted-foreground">{generation.agentId || "-"}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(generation.createdAt).toLocaleDateString("zh-CN")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 min-w-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right break-all min-w-0">{value}</span>
    </div>
  )
}

function StatMini({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: number
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3">
        {icon}
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
