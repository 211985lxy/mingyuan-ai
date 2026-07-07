"use client"

import React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  ArrowLeft,
  BookOpen,
  Bot,
  Database,
  FileText,
  Loader2,
  Save,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { getAgentLogicProfile } from "@/lib/agent-logic-profile"
import type { AimAgentId } from "@/lib/aim-ui-config"

function getAdminToken(): string {
  if (typeof window === "undefined") return ""
  try {
    const authStr = localStorage.getItem("mingyuan-admin-auth")
    if (!authStr) return ""
    return JSON.parse(authStr).state?.token || ""
  } catch {
    return ""
  }
}

interface GuideDetail {
  agentId: string
  title: string
  description: string
  guide: {
    intro: string
    placeholder: string
    primaryActionLabel: string
    quickPrompts: string[]
    scenarios: string[]
    outputAssets: string[]
    _overriddenFields: string[]
  }
}

export default function AgentMethodologyDetailPage() {
  const params = useParams<{ agentId: string }>()
  const agentId = params.agentId as AimAgentId
  const profile = getAgentLogicProfile(agentId)

  const [guide, setGuide] = React.useState<GuideDetail | null>(null)
  const [loading, setLoading] = React.useState(true)

  // 可编辑文案本地态
  const [intro, setIntro] = React.useState("")
  const [placeholder, setPlaceholder] = React.useState("")
  const [primaryActionLabel, setPrimaryActionLabel] = React.useState("")
  const [quickPrompts, setQuickPrompts] = React.useState("")
  const [scenarios, setScenarios] = React.useState("")
  const [outputAssets, setOutputAssets] = React.useState("")
  const [savingField, setSavingField] = React.useState<string | null>(null)

  // setters 由 React 保证稳定，无需进依赖；agentId 变化时重新拉取
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const fetchGuide = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/agents/guides", {
        headers: { Authorization: `Bearer ${getAdminToken()}` },
      })
      const json = await res.json()
      const found = (Array.isArray(json.data) ? json.data : []).find(
        (g: GuideDetail) => g.agentId === agentId
      )
      if (found) {
        setGuide(found)
        setIntro(found.guide.intro)
        setPlaceholder(found.guide.placeholder)
        setPrimaryActionLabel(found.guide.primaryActionLabel)
        setQuickPrompts(found.guide.quickPrompts.join("\n"))
        setScenarios(found.guide.scenarios.join("\n"))
        setOutputAssets(found.guide.outputAssets.join("\n"))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "文案加载失败")
    } finally {
      setLoading(false)
    }
  }, [agentId])

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchGuide()
  }, [fetchGuide])

  async function saveField(field: string, value: string) {
    setSavingField(field)
    try {
      // 数组字段转数组
      let payload: string | string[] = value
      if (["quickPrompts", "scenarios", "outputAssets"].includes(field)) {
        payload = value
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
      }
      const res = await fetch("/api/admin/agents/guides", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAdminToken()}`,
        },
        body: JSON.stringify({ agentId, field, value: payload }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "保存失败" }))
        throw new Error(err.error || "保存失败")
      }
      toast.success("文案已保存（仅影响前台展示）")
      fetchGuide()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSavingField(null)
    }
  }

  if (!profile) {
    return (
      <div className="space-y-4">
        <Link href="/admin/methodology">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回方法论
          </Button>
        </Link>
        <p className="text-muted-foreground">未找到该智能体。</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 返回 + 标题 */}
      <div>
        <Link href="/admin/methodology">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            返回方法论
          </Button>
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Bot className="h-6 w-6 text-primary" />
          {profile.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{profile.description}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左：逻辑档案（只读） */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Database className="h-4 w-4 text-primary" />
                调用的知识分类
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {profile.knowledgeCategories.map((c, i) => (
                  <Badge key={c.key} variant="secondary" className="text-xs">
                    {i + 1}. {c.label}
                  </Badge>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                按优先级排序，检索时前面的分类权重更高。该映射来自代码常量，仅展示不可编辑。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                应用的方法论
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {profile.methodologies.map((m) => (
                <div key={m.key} className="flex items-center gap-2">
                  <Badge variant="outline">{m.label}</Badge>
                  {m.note ? <span className="text-xs text-muted-foreground">{m.note}</span> : null}
                </div>
              ))}
              <Link href="/admin/methodology" className="inline-block pt-1 text-xs text-primary hover:underline">
                ← 去方法论库编辑内容
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                模型 / 通道链
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-1.5">
                {profile.modelChain.map((m, i) => (
                  <React.Fragment key={m.provider}>
                    <Badge variant={i === 0 ? "default" : "secondary"} className="text-xs">
                      {i === 0 ? "主：" : "备："}
                      {m.label}
                    </Badge>
                    {i < profile.modelChain.length - 1 ? (
                      <span className="text-xs text-muted-foreground">→</span>
                    ) : null}
                  </React.Fragment>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                主模型不可用时按顺序回退到备用通道。
              </p>
            </CardContent>
          </Card>

          {profile.otherContextSources.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-4 w-4 text-primary" />
                  其他知识源
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {profile.otherContextSources.map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      {s}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* 右：文案编辑 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">展示文案编辑</CardTitle>
            <p className="text-xs text-muted-foreground">
              仅影响前台智能体工作台的展示文案，不影响实际生成逻辑。
              {guide?.guide._overriddenFields?.length
                ? ` 已覆盖字段：${guide.guide._overriddenFields.join("、")}`
                : "（当前全部使用默认值）"}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <>
                <EditableField
                  label="定位介绍（intro）"
                  value={intro}
                  onChange={setIntro}
                  onSave={() => saveField("intro", intro)}
                  saving={savingField === "intro"}
                  multiline
                />
                <EditableField
                  label="输入框占位符（placeholder）"
                  value={placeholder}
                  onChange={setPlaceholder}
                  onSave={() => saveField("placeholder", placeholder)}
                  saving={savingField === "placeholder"}
                />
                <EditableField
                  label="主按钮文字（primaryActionLabel）"
                  value={primaryActionLabel}
                  onChange={setPrimaryActionLabel}
                  onSave={() => saveField("primaryActionLabel", primaryActionLabel)}
                  saving={savingField === "primaryActionLabel"}
                />
                <EditableField
                  label="快捷提示（每行一条）"
                  value={quickPrompts}
                  onChange={setQuickPrompts}
                  onSave={() => saveField("quickPrompts", quickPrompts)}
                  saving={savingField === "quickPrompts"}
                  multiline
                  hint="用户可一键点击的快捷指令"
                />
                <EditableField
                  label="适用场景（每行一条）"
                  value={scenarios}
                  onChange={setScenarios}
                  onSave={() => saveField("scenarios", scenarios)}
                  saving={savingField === "scenarios"}
                  multiline
                />
                <EditableField
                  label="产出物（每行一条）"
                  value={outputAssets}
                  onChange={setOutputAssets}
                  onSave={() => saveField("outputAssets", outputAssets)}
                  saving={savingField === "outputAssets"}
                  multiline
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EditableField({
  label,
  value,
  onChange,
  onSave,
  saving,
  multiline,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onSave: () => void
  saving: boolean
  multiline?: boolean
  hint?: string
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {multiline ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} className="text-sm" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="text-sm" />
      )}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      <div>
        <Button size="sm" variant="outline" onClick={onSave} disabled={saving}>
          {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
          保存
        </Button>
      </div>
    </div>
  )
}
