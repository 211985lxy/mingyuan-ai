"use client"

import Link from "next/link"
import { ArrowUpRight, CheckCircle2, Redo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { saveVideoHandoff } from "@/lib/studio/studio-prefs"

/** Step 3 出成品：试听/下载 + 去向（升级为视频、重新编辑、查看全部作品）。 */
export function AudioResultStep({
  playerUrl,
  charCount,
  script,
  onReedit,
}: {
  playerUrl: string
  charCount: number | null
  script: string
  onReedit: () => void
}) {
  function handleUpgrade() {
    // 文案走 sessionStorage 交接：长文放 URL 会超 header 限制
    saveVideoHandoff({ script })
  }

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CheckCircle2 className="h-5 w-5 text-primary" />
          配音完成
        </h2>
        <p className="text-sm text-muted-foreground">
          已自动存入「作品 · 配音历史」，可随时回听或下载。
          {charCount ? `（${charCount} 字）` : ""}
        </p>
      </header>

      <Card>
        <CardContent className="space-y-4 py-5">
          <audio controls src={playerUrl} className="w-full" preload="metadata">
            <track kind="captions" />
          </audio>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" nativeButton={false} render={<a href={playerUrl} download="mingyuan-voice.mp3" />}>
              下载 MP3
            </Button>
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/studio/video?from=audio" onClick={handleUpgrade} />}>
              <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
              升级为数字人视频
            </Button>
            <Button size="sm" variant="ghost" onClick={onReedit}>
              <Redo2 className="mr-1 h-3.5 w-3.5" />
              重新编辑
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            「升级为视频」会带着这段文案进入视频工作台，只需再选一个形象。
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" nativeButton={false} render={<Link href="/studio/works" />}>
          查看全部作品
        </Button>
        <Button variant="ghost" nativeButton={false} render={<Link href="/studio/audio" />}>
          再配一条
        </Button>
      </div>
    </section>
  )
}
