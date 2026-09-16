import { useEffect, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * @description projectselector
 * @param options - 配置选项
 * @returns 无返回值
 */
export function ProjectSelector({ value, onChange }: { value: string; onChange: (projectId: string) => void }) {
  const [projects, setProjects] = useState<Array<{ id: string; name: string; companyName: string | null }>>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    setFailed(false)
    fetch("/api/admin/projects?status=active&pageSize=100")
      // HTTP 错误不能当成「没有项目」：否则用户以为项目丢了
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("加载失败"))))
      .then((json) => setProjects(json.data ?? []))
      .catch(() => {
        setFailed(true)
        setProjects([])
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <Select value={value} onValueChange={(projectId) => { if (projectId) onChange(projectId) }}>
      <SelectTrigger className="h-10"><SelectValue placeholder={loading ? "加载中..." : "选择项目 *"} /></SelectTrigger>
      <SelectContent>
        {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}{project.companyName ? ` · ${project.companyName}` : ""}</SelectItem>)}
        {projects.length === 0 && !loading ? (
          <div className="px-2 py-3 text-center text-sm text-muted-foreground">
            {failed ? "项目加载失败，请重新打开此表单" : "暂无项目"}
          </div>
        ) : null}
      </SelectContent>
    </Select>
  )
}
