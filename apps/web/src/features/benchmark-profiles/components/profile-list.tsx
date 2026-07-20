import Link from "next/link"
import { ChevronLeft, ChevronRight, FileText, Plus, Target, Undo2, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { KIND_COLORS, KIND_LABELS, PLATFORM_COLORS, PLATFORM_LABELS, formatFollowerCount, type ProfileListItem } from "@/features/benchmark-profiles/model"
import { cn } from "@/lib/utils"

/**
 * @description benchmarkprofilelist
 * @param options - 配置选项
 * @returns 无返回值
 */
export function BenchmarkProfileList({ loading, profiles, status, page, total, totalPages, onCreate, onRestore, onPageChange }: { loading: boolean; profiles: ProfileListItem[]; status: string; page: number; total: number; totalPages: number; onCreate: () => void; onRestore: (id: string) => void; onPageChange: (page: number) => void }) {
  if (loading) {
    return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-44 rounded-xl" />)}</div>
  }

  if (profiles.length === 0) {
    return (
      <Card><CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center"><Target className="h-10 w-10 text-muted-foreground/40" /><div><p className="font-medium">{status === "archived" ? "没有已归档的档案" : "还没有档案"}</p><p className="mt-1 text-sm text-muted-foreground">{status === "archived" ? "归档的档案会显示在这里" : "添加一个真实账号或客户资料即可"}</p></div>{status !== "archived" ? <Button variant="outline" onClick={onCreate}><Plus className="mr-2 h-4 w-4" />添加档案</Button> : null}</CardContent></Card>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {profiles.map((profile) => (
          <Card key={profile.id} className="h-full transition-colors hover:border-foreground/20">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/admin/benchmark-profiles/${profile.id}`} className="min-w-0 truncate text-base font-semibold hover:underline">{profile.name}</Link>
                {profile.platform && PLATFORM_LABELS[profile.platform] ? <Badge variant="outline" className={cn("shrink-0 text-[10px]", PLATFORM_COLORS[profile.platform])}>{PLATFORM_LABELS[profile.platform]}</Badge> : null}
              </div>
              {profile.positioning ? <p className="line-clamp-2 text-sm text-muted-foreground">{profile.positioning}</p> : null}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" />{profile._count.items} 份资料</span>
                {profile.followerCount != null ? <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{formatFollowerCount(profile.followerCount)}</span> : null}
              </div>
              {profile.project ? <div className="truncate text-xs text-muted-foreground">项目：{profile.project.name}</div> : null}
              {profile.items.length > 0 ? <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-xs">{profile.items.map((item) => <div key={item.id} className="min-w-0"><div className="flex items-center gap-2"><Badge variant="secondary" className={cn("shrink-0 px-1.5 py-0 text-[10px]", KIND_COLORS[item.kind])}>{KIND_LABELS[item.kind] ?? item.kind}</Badge><span className="truncate font-medium">{item.title}</span></div><p className="mt-1 line-clamp-2 text-muted-foreground">{item.content}</p></div>)}</div> : null}
              <div className="flex items-center gap-2 border-t pt-1"><Link href={`/admin/benchmark-profiles/${profile.id}`} className="flex-1"><Button variant="outline" size="sm" className="w-full">查看详情</Button></Link>{status === "archived" ? <Button variant="outline" size="sm" onClick={() => onRestore(profile.id)} className="text-emerald-600 hover:text-emerald-700"><Undo2 className="mr-1 h-3.5 w-3.5" />恢复</Button> : null}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {totalPages > 1 ? <div className="flex items-center justify-center gap-2 pt-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}><ChevronLeft className="h-4 w-4" /></Button><span className="text-sm text-muted-foreground">{page} / {totalPages}（共 {total} 条）</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(Math.min(totalPages, page + 1))}><ChevronRight className="h-4 w-4" /></Button></div> : null}
    </>
  )
}
