"use client"

import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CATEGORY_LABELS, KNOWLEDGE_CATEGORIES } from "@/lib/knowledge-categories"
import type { ClientProject } from "@/lib/api/projects"

export function CustomerKnowledgeFilters(props: {
  keyword: string
  onKeywordChange: (value: string) => void
  projectFilter: string
  onProjectFilterChange: (value: string) => void
  categoryFilter: string
  onCategoryFilterChange: (value: string) => void
  statusFilter: "active" | "archived"
  onStatusFilterChange: (value: "active" | "archived") => void
  projects: ClientProject[]
}) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={props.keyword}
          onChange={(e) => props.onKeywordChange(e.target.value)}
          placeholder="搜索标题、内容或标签"
          className="pl-9"
        />
      </div>
      <Select value={props.projectFilter} onValueChange={(v) => props.onProjectFilterChange(v ?? "all")}>
        <SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="项目" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部项目</SelectItem>
          <SelectItem value="none">全局资料</SelectItem>
          {props.projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={props.categoryFilter} onValueChange={(v) => props.onCategoryFilterChange(v ?? "all")}>
        <SelectTrigger className="w-full lg:w-44"><SelectValue placeholder="分类" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">全部分类</SelectItem>
          {KNOWLEDGE_CATEGORIES.map((key) => (
            <SelectItem key={key} value={key}>{CATEGORY_LABELS[key] ?? key}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={props.statusFilter}
        onValueChange={(v) => props.onStatusFilterChange((v as "active" | "archived") ?? "active")}
      >
        <SelectTrigger className="w-full lg:w-36"><SelectValue placeholder="状态" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="active">使用中</SelectItem>
          <SelectItem value="archived">已归档</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
