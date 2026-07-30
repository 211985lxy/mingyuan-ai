"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, Loader2, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import {
  createClientProject,
  listClientProjects,
  type ClientProject,
} from "@/lib/api/client"
import { ProjectKnowledgeAssetHealth } from "@/components/projects/project-knowledge-asset-health"

function projectMetaLine(project: ClientProject): string {
  const parts = [
    project.companyName?.trim() || null,
    project.industry?.trim() || null,
    `${project._count?.aimGenerations ?? 0} 条内容`,
  ].filter(Boolean)
  return parts.join(" · ")
}

export default function ProjectsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "",
    companyName: "",
    industry: "",
    targetCustomer: "",
    offer: "",
    deliveryGoal: "",
  })

  useEffect(() => {
    listClientProjects()
      .then(setProjects)
      .catch(() => toast.error("项目读取失败，请重新登录后再试"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (searchParams?.get("intent") !== "create") return
    const nameEl = document.getElementById("project-name") as HTMLInputElement | null
    nameEl?.focus()
    nameEl?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [searchParams])

  async function handleCreateProject() {
    const name = form.name.trim()
    if (!name) {
      toast.error("请先填写项目名称")
      const nameEl = document.getElementById("project-name") as HTMLInputElement | null
      nameEl?.focus()
      nameEl?.scrollIntoView({ block: "center", behavior: "smooth" })
      return
    }

    setSaving(true)
    try {
      const project = await createClientProject({
        name,
        companyName: form.companyName,
        industry: form.industry,
        targetCustomer: form.targetCustomer,
        offer: form.offer,
        deliveryGoal: form.deliveryGoal,
      })
      setProjects((current) => [project, ...current])
      setForm({
        name: "",
        companyName: "",
        industry: "",
        targetCustomer: "",
        offer: "",
        deliveryGoal: "",
      })
      toast.success(`已创建项目「${project.name}」`)
      router.push(`/aim?projectId=${encodeURIComponent(project.id)}&stage=direction`)
    } catch {
      toast.error("项目创建失败，请检查必填信息或重新登录")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <WorkbenchHero
        title="我的项目"
        subtitle="先建项目，再沉淀资料、改文案、生产内容。"
        badge={<Badge variant="secondary">{projects.length} 个项目</Badge>}
      />

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        {/* 左：新建 */}
        <section className="min-w-0 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">新建项目</h2>
            <p className="text-sm text-muted-foreground">只填成交交付必填信息。</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">
                项目名称 <span className="text-destructive">*</span>
              </Label>
              <Input
                id="project-name"
                value={form.name}
                placeholder="例如：某机械厂老板IP"
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="company-name">公司/品牌</Label>
                <Input
                  id="company-name"
                  value={form.companyName}
                  placeholder="公司或品牌名"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      companyName: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">行业</Label>
                <Input
                  id="industry"
                  value={form.industry}
                  placeholder="制造业 / 本地生活 / 教培"
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      industry: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-customer">目标客户</Label>
              <Textarea
                id="target-customer"
                value={form.targetCustomer}
                placeholder="主要想成交谁？"
                className="min-h-20"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    targetCustomer: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer">核心业务/产品</Label>
              <Textarea
                id="offer"
                value={form.offer}
                placeholder="卖什么？优势是什么？"
                className="min-h-20"
                onChange={(event) =>
                  setForm((current) => ({ ...current, offer: event.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-goal">交付目标</Label>
              <Textarea
                id="delivery-goal"
                value={form.deliveryGoal}
                placeholder="例如：先跑通 30 条口播，导入私域咨询。"
                className="min-h-20"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deliveryGoal: event.target.value,
                  }))
                }
              />
            </div>
            <Button className="w-full" disabled={saving} onClick={handleCreateProject}>
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              创建项目
            </Button>
          </div>
        </section>

        {/* 右：列表 */}
        <section className="min-w-0 space-y-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold tracking-tight text-foreground">进行中的项目</h2>
            <p className="text-sm text-muted-foreground">选一个进入 AI 内容总监。</p>
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在读取项目
            </div>
          ) : projects.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border/80 text-sm text-muted-foreground">
              还没有项目，先在左侧创建一个。
            </div>
          ) : (
            <ul className="divide-y divide-border/70 border-y border-border/70">
              {projects.map((project) => (
                <li key={project.id} className="py-4 first:pt-3 last:pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <h3 className="truncate text-base font-semibold text-foreground">
                        {project.name}
                      </h3>
                      <p className="truncate text-xs text-muted-foreground">
                        {projectMetaLine(project)}
                      </p>
                      <ProjectKnowledgeAssetHealth projectId={project.id} />
                    </div>
                    <Button
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        router.push(
                          `/aim?projectId=${encodeURIComponent(project.id)}&stage=direction`,
                        )
                      }
                    >
                      进入
                      <ArrowRight className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
