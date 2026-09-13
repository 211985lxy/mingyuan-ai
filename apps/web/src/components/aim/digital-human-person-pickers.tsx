"use client"

import { Badge } from "@/components/ui/badge"
import type { ApiAvatar } from "@/types/api"
import type { PublicDigitalPersonList, PublicDigitalPersonOption } from "@/lib/api/digital-human"

/** 我的数字人（资产库中状态为可用）。 */
export function AvatarPicker({
  avatars,
  loading,
  selectedId,
  onSelect,
}: {
  avatars: ApiAvatar[]
  loading: boolean
  selectedId: string
  onSelect: (avatarId: string) => void
}) {
  if (loading) return <p className="text-sm text-muted-foreground">加载中…</p>
  if (avatars.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
        还没有可用数字人。请先到资产库完成克隆（状态为「可用」），或改用上方「公共数字人」直接出片。
      </div>
    )
  }
  return (
    <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
      {avatars.map((avatar) => (
        <PersonOption
          key={avatar.id}
          selected={avatar.id === selectedId}
          onSelect={() => onSelect(avatar.id)}
          name={avatar.name}
          meta={avatar.speakerName || "已绑定声音"}
        />
      ))}
    </div>
  )
}

/**
 * 公共数字人（蝉镜开放平台现成形象）。
 * 无需克隆与授权视频，因此授权文案未配置时这是唯一可出片的路径。
 */
export function PublicPersonPicker({
  state,
  loading,
  selectedId,
  onSelect,
}: {
  state: PublicDigitalPersonList | null
  loading: boolean
  selectedId: string
  onSelect: (person: PublicDigitalPersonOption) => void
}) {
  if (loading) return <p className="text-sm text-muted-foreground">加载公共数字人…</p>
  if (!state) return <p className="text-sm text-muted-foreground">尚未加载</p>
  if (state.status === "not_configured") {
    return (
      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
        {state.message}
      </div>
    )
  }
  if (state.status === "error") {
    return (
      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-destructive">
        公共数字人读取失败：{state.message}
      </div>
    )
  }
  if (state.persons.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
        供应商未返回可用形象，请稍后重试。
      </div>
    )
  }
  return (
    <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2">
      {state.persons.map((person) => (
        <PersonOption
          key={person.id}
          selected={person.id === selectedId}
          onSelect={() => onSelect(person)}
          name={person.name}
          meta={person.voiceName ? `自带音色 · ${person.voiceName}` : "使用公共音色"}
          badge={person.gender}
        />
      ))}
    </div>
  )
}

/** 单条形象选项（两个来源共用外观）。 */
function PersonOption({
  selected,
  onSelect,
  name,
  meta,
  badge,
}: {
  selected: boolean
  onSelect: () => void
  name: string
  meta: string
  badge?: string | null
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
        selected ? "border-primary bg-primary/5" : "hover:border-primary/40"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="truncate font-medium">{name}</span>
        {badge ? (
          <Badge variant="outline" className="px-1.5 text-xs font-normal">
            {badge}
          </Badge>
        ) : null}
      </span>
      <span className="block truncate text-xs text-muted-foreground">{meta}</span>
    </button>
  )
}
