import { Folder, Globe } from "lucide-react"
import type { KnowledgeBrowserProps } from "./knowledge-browser"

type Project = KnowledgeBrowserProps["projects"][number]

export function KnowledgeProjectOverview({
  projects,
  onSelectProject,
}: {
  projects: Project[]
  onSelectProject: (value: string) => void
}) {
  return (
    <section className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">先选择一个项目，再处理它的知识资产。</p>
        <h2 className="mt-1 text-lg font-semibold">项目总览</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <button
            key={project.id}
            type="button"
            onClick={() => onSelectProject(project.id)}
            className="rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-primary/[0.03]"
          >
            <div className="flex items-start gap-3">
              <Folder className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold">{project.name}</h3>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {project.companyName ?? project.industry ?? "未填写行业"}
                </p>
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {project.knowledgeCount ?? 0} 条
              </span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">进入项目工作台 →</p>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSelectProject("unbound")}
        className="flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
      >
        <Globe className="h-5 w-5" />
        <span className="flex-1">查看未绑定项目的资料</span>
        <span>进入 →</span>
      </button>
    </section>
  )
}
