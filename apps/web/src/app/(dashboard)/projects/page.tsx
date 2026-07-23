"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowRight, BriefcaseBusiness, Loader2, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { AiResultPanel } from "@/components/workbench/ai-result-panel"
import { WorkbenchHero } from "@/components/workbench/workbench-hero"
import {
  createClientProject,
  listClientProjects,
  type ClientProject,
} from "@/lib/api/client"
import { ProjectKnowledgeAssetHealth } from "@/components/projects/project-knowledge-asset-health"
import { ProjectAssetCandidateReview } from "@/components/projects/project-asset-candidate-review"

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
      .catch(() => toast.error("IP营销全案读取失败，请重新登录后再试"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (searchParams?.get("intent") !== "create") return
    document.getElementById("project-name")?.focus()
  }, [searchParams])

  async function handleCreateProject() {
    const name = form.name.trim()
    if (!name) {
      toast.error("请先填写全案名称")
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
      toast.success(`已创建全案「${project.name}」`)
      router.push(`/aim?projectId=${encodeURIComponent(project.id)}&stage=direction`)
    } catch {
      toast.error("IP营销全案创建失败，请检查必填信息或重新登录")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <WorkbenchHero
        title="IP营销全案"
        subtitle="先建全案，再沉淀资料、改文案、生产短视频内容。"
        badge={<Badge variant="secondary">{projects.length} 个全案</Badge>}
      />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <AiResultPanel
          title="新建IP营销全案"
          icon={<BriefcaseBusiness className="size-5 text-primary" />}
          meta={<span>第一版只保留成交交付必填信息。</span>}
          contentClassName="space-y-4 p-4"
        >
            <div className="space-y-2">
              <Label htmlFor="project-name">
                全案名称 <span className="text-destructive">*</span>
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
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-2">
                <Label htmlFor="company-name">公司/品牌</Label>
                <Input
                  id="company-name"
                  value={form.companyName}
                  placeholder="客户公司名"
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
                placeholder="客户主要想成交谁？"
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
                placeholder="客户卖什么？优势是什么？"
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
                placeholder="例如：先跑通30条口播内容，导入私域咨询。"
                className="min-h-20"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    deliveryGoal: event.target.value,
                  }))
                }
              />
            </div>
            <Button
              className="w-full"
              disabled={saving}
              onClick={handleCreateProject}
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
              创建IP营销全案
            </Button>
        </AiResultPanel>

        <AiResultPanel
          title="进行中的全案"
          icon={<BriefcaseBusiness className="size-5 text-primary" />}
          meta={<span>选一个全案进入 AI内容总监，做改文案、脚本和拍摄交接单。</span>}
        >
            {loading ? (
              <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" />
                正在读取IP营销全案
              </div>
            ) : projects.length === 0 ? (
              <div className="flex h-40 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
                还没有IP营销全案，先在左侧创建一个。
              </div>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className="rounded-xl border border-primary/10 bg-background p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold">
                            {project.name}
                          </h3>
                          <Badge variant="secondary">
                            {project.industry || "未填写行业"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {project.companyName || "未填写公司/品牌"}
                        </p>
                        <p className="line-clamp-2 text-sm">
                          {project.deliveryGoal || "暂无交付目标"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          已生成 {project._count?.aimGenerations ?? 0} 条内容
                        </p>
                        <ProjectKnowledgeAssetHealth projectId={project.id} />
                        <ProjectAssetCandidateReview projectId={project.id} />
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => router.push(`/aim?projectId=${encodeURIComponent(project.id)}&stage=direction`)}
                      >
                        进入AI内容总监
                        <ArrowRight className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </AiResultPanel>
      </div>
    </div>
  )
}
