import { Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { SmartImportProjectOption } from "./smart-import-types"

const ACCEPT = ".pdf,.txt,.md,.csv,.docx,.xls,.xlsx,.pptx,.html,.htm,.json,.xml,.rtf"

/**
 * @description smartimportuploadstep
 * @param props - 组件属性
 * @returns 无返回值
 */
export function SmartImportUploadStep(props: {
  files: File[]
  projectId: string
  projects: SmartImportProjectOption[]
  onFilesChange: (files: File[]) => void
  onProjectChange: (projectId: string) => void
  onAnalyze: () => void
  onCancel: () => void
}) {
  return <div className="space-y-4">
    <div>
      <Label>归属项目</Label>
      <Select value={props.projectId} onValueChange={(value) => props.onProjectChange(value ?? "none")}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">全局资料（不属于客户 IP）</SelectItem>
          {props.projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div>
      <Label>选择文件（支持 PDF/Word（.docx）/PPT/Excel/HTML/TXT/MD/CSV/JSON/XML/RTF）</Label>
      <Input type="file" accept={ACCEPT} multiple onChange={(event) => props.onFilesChange(Array.from(event.target.files ?? []))} className="mt-1 cursor-pointer" />
    </div>
    {props.files.length > 0 && <div className="space-y-1">
      <p className="text-xs text-muted-foreground">已选 {props.files.length} 个文件：</p>
      <div className="flex flex-wrap gap-2">
        {props.files.map((file, index) => <Badge key={`${file.name}-${index}`} variant="secondary" className="text-xs">
          {file.name} ({(file.size / 1024).toFixed(1)}KB)
          <button className="ml-1 hover:text-destructive" onClick={() => props.onFilesChange(props.files.filter((_, itemIndex) => itemIndex !== index))}>×</button>
        </Badge>)}
      </div>
    </div>}
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="outline" onClick={props.onCancel} className="cursor-pointer">取消</Button>
      <Button onClick={props.onAnalyze} disabled={!props.files.length} className="cursor-pointer"><Sparkles className="mr-1 h-4 w-4" />开始智能分析</Button>
    </div>
  </div>
}
