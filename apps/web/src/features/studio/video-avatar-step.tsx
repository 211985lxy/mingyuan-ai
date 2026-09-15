"use client"

import { useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AvatarPicker, PublicPersonPicker } from "@/components/aim/digital-human-person-pickers"
import type { PublicDigitalPersonList, PublicDigitalPersonOption } from "@/lib/api/digital-human"
import type { ClientProject } from "@/lib/api/projects"
import type { ApiAvatar } from "@/types/api"

export type AvatarSource = "mine" | "public"

/** Step 1 选形象：项目 → 我的形象/公共形象 二选一区。 */
export function VideoAvatarStep(props: {
  projects: ClientProject[]
  projectId: string
  onProjectChange: (projectId: string) => void
  avatarSource: AvatarSource
  onSourceChange: (source: AvatarSource) => void
  avatars: ApiAvatar[]
  loadingAvatars: boolean
  avatarLoadError: string | null
  selectedAvatarId: string
  onSelectAvatar: (avatarId: string) => void
  publicPersons: PublicDigitalPersonList | null
  loadingPublic: boolean
  selectedPublic: PublicDigitalPersonOption | null
  onSelectPublic: (person: PublicDigitalPersonOption) => void
  onNext: () => void
}) {
  const readyAvatars = useMemo(
    () => props.avatars.filter((item) => item.status === "ready"),
    [props.avatars],
  )
  const publicVoiceId =
    props.selectedPublic?.defaultVoiceId
    ?? (props.publicPersons?.status === "ok" ? props.publicPersons.fallbackVoiceId : null)
  const canNext = props.avatarSource === "public"
    ? Boolean(props.selectedPublic && publicVoiceId)
    : Boolean(props.selectedAvatarId)

  return (
    <section className="space-y-5">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">选择形象</h2>
        <p className="text-sm text-muted-foreground">公共形象无需克隆、当天可用；我的形象来自资产库克隆。</p>
      </header>

      <ProjectPickerRow
        projects={props.projects}
        projectId={props.projectId}
        onProjectChange={props.onProjectChange}
      />

      <SourcePickerRow avatarSource={props.avatarSource} onSourceChange={props.onSourceChange} />

      <AvatarPickerCard {...props} readyAvatars={readyAvatars} />

      <div className="flex justify-end">
        <Button type="button" disabled={!canNext} onClick={props.onNext}>
          下一步：声音与文案
        </Button>
      </div>
    </section>
  )
}

/** 形象选择区：四种状态（无项目 / 读取失败 / 公共 / 我的）各给明确出口。 */
function AvatarPickerCard({
  readyAvatars,
  ...props
}: Parameters<typeof VideoAvatarStep>[0] & { readyAvatars: ApiAvatar[] }) {
  return (
    <Card>
      <CardContent className="py-4">
        {props.projects.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">先创建客户项目，再选择形象。</p>
        ) : props.avatarSource === "mine" && props.avatarLoadError ? (
          <div className="space-y-2 py-6 text-center">
            <p className="text-sm text-destructive">形象列表读取失败：{props.avatarLoadError}</p>
            <p className="text-xs text-muted-foreground">
              这不代表你没有形象——可切换上方「公共形象」直接出片，或稍后重新进入本页。
            </p>
          </div>
        ) : props.avatarSource === "public" ? (
          <PublicPersonPicker
            state={props.publicPersons}
            loading={props.loadingPublic}
            selectedId={props.selectedPublic?.id ?? ""}
            onSelect={props.onSelectPublic}
          />
        ) : (
          <AvatarPicker
            avatars={readyAvatars}
            loading={props.loadingAvatars}
            selectedId={props.selectedAvatarId}
            onSelect={props.onSelectAvatar}
          />
        )}
        <SelectionHint
          avatarSource={props.avatarSource}
          loadingAvatars={props.loadingAvatars}
          readyAvatars={readyAvatars}
          selectedAvatarId={props.selectedAvatarId}
          selectedPublic={props.selectedPublic}
        />
      </CardContent>
    </Card>
  )
}

export function ProjectPickerRow({
  projects,
  projectId,
  onProjectChange,
}: {
  projects: ClientProject[]
  projectId: string
  onProjectChange: (projectId: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="studio-video-project" className="text-xs text-muted-foreground">
        客户项目
      </Label>
      <Select value={projectId || undefined} onValueChange={(value) => value && onProjectChange(value)}>
        <SelectTrigger id="studio-video-project" className="h-8 w-[220px] text-xs">
          <SelectValue placeholder={projects.length === 0 ? "暂无项目" : "选择客户项目"} />
        </SelectTrigger>
        <SelectContent>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {projects.length === 0 ? (
        <span className="text-xs text-destructive">出片需要先有一个客户项目，请到「我的项目」创建。</span>
      ) : null}
    </div>
  )
}

function SourcePickerRow({
  avatarSource,
  onSourceChange,
}: {
  avatarSource: AvatarSource
  onSourceChange: (source: AvatarSource) => void
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Button
        type="button"
        variant={avatarSource === "mine" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => onSourceChange("mine")}
      >
        我的形象
      </Button>
      <Button
        type="button"
        variant={avatarSource === "public" ? "secondary" : "ghost"}
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={() => onSourceChange("public")}
      >
        公共形象
      </Button>
      {avatarSource === "mine" ? (
        <a href="/assets" className="text-xs text-primary underline-offset-2 hover:underline">
          去资产库克隆新形象
        </a>
      ) : null}
    </div>
  )
}

function SelectionHint({
  avatarSource,
  loadingAvatars,
  readyAvatars,
  selectedAvatarId,
  selectedPublic,
}: {
  avatarSource: AvatarSource
  loadingAvatars: boolean
  readyAvatars: ApiAvatar[]
  selectedAvatarId: string
  selectedPublic: PublicDigitalPersonOption | null
}) {
  if (avatarSource === "public") {
    if (!selectedPublic) return null
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        已选「{selectedPublic.name}」
        {selectedPublic.voiceName ? ` · 配套音色：${selectedPublic.voiceName}` : ""}
      </p>
    )
  }
  if (loadingAvatars || readyAvatars.length === 0) return null
  return (
    <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      已选 {readyAvatars.find((item) => item.id === selectedAvatarId)?.name ?? "形象"}
      <Badge variant="secondary">可用</Badge>
    </p>
  )
}
