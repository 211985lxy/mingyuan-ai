"use client"

import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { ClientProject } from "@/lib/api/projects"
import type { ParsedExternalAiMemory } from "@/lib/knowledge/external-ai-memory-parse"

export function ExternalAiMemoryImportFields(props: {
  projectId: string
  projects: ClientProject[]
  rawText: string
  parsed: ParsedExternalAiMemory | null
  saving: boolean
  onProjectIdChange: (projectId: string) => void
  onRawTextChange: (rawText: string) => void
  onCancel: () => void
  onParse: () => void
  onConfirm: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>绑定项目</Label>
        <Select
          value={props.projectId || undefined}
          onValueChange={(value) => {
            if (value) props.onProjectIdChange(value)
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择项目" />
          </SelectTrigger>
          <SelectContent>
            {props.projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>记忆原文</Label>
        <Textarea
          value={props.rawText}
          onChange={(event) => props.onRawTextChange(event.target.value)}
          rows={12}
          placeholder={"粘贴例如：\n关于你的记忆\n\n工作背景\n…\n个人背景\n…"}
          className="font-mono text-sm"
        />
      </div>

      {props.parsed?.ok ? (
        <div className="space-y-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
          <p className="text-foreground">{props.parsed.summary}</p>
          <ul className="space-y-2 text-muted-foreground">
            {props.parsed.drafts.map((draft) => (
              <li key={draft.sectionKey} className="rounded-md bg-background/80 p-2">
                <p className="font-medium text-foreground">{draft.title}</p>
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap">{draft.content}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={props.onCancel} disabled={props.saving}>
          取消
        </Button>
        <Button
          variant="secondary"
          onClick={props.onParse}
          disabled={props.saving || !props.rawText.trim()}
        >
          解析预览
        </Button>
        <Button onClick={props.onConfirm} disabled={props.saving || !props.parsed?.ok}>
          {props.saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          确认入库
        </Button>
      </div>
    </div>
  )
}
