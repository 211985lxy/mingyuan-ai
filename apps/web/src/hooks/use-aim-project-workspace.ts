"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import { listAimHistory, listClientProjects, type AimGeneration, type ClientProject } from "@/lib/api/client"
import { getAccountProjectContext, type AccountProjectContextResponse } from "@/lib/api/projects"

/**
 * @description 选择 authorizedProjectId
 * @param currentProjectId - 当前值（URL/草稿）Project 唯一标识符
 * @param projects - 服务端返回的项目列表
 * @returns 规范化后的项目 ID；无可用项目时返回空字符串
 *
 * 账号绑定规范下服务端对每个账号只返回一个绑定项目：该绑定项目始终优先于
 * URL/草稿里的任何 projectId（快速模式与完整模式共用同一条选择规则）。
 */
export function selectAuthorizedProjectId(currentProjectId: string, projects: ClientProject[]) {
  if (projects.length === 1) return projects[0].id
  if (currentProjectId && projects.some((project) => project.id === currentProjectId)) return currentProjectId
  return ""
}

/**
 * 账号项目上下文 → 工作台访问闸门。
 *
 * setup_required / admin_review_required / inactive_project_recovery_required 都是
 * 「非绑定 / 不可用」状态：工作台应清空项目选择并给出指向明确的提示
 * （第 4 态 inactive_project_recovery_required 指向管理员恢复），而不是落入
 * bound 路径产生互相矛盾的界面文案。快速/完整模式在进入列表前都经过该闸门。
 */
export function describeProjectAccessGate(context: AccountProjectContextResponse): {
  blocked: boolean
  accessError: string | null
} {
  if (context.status === "setup_required") {
    return { blocked: true, accessError: "当前账号尚未绑定 IP 项目，请先完成项目设置。" }
  }
  if (context.status === "admin_review_required") {
    return {
      blocked: true,
      accessError: `当前账号有 ${context.projectCount} 个待绑定项目，已暂停生成，请联系管理员处理。`,
    }
  }
  if (context.status === "inactive_project_recovery_required") {
    return {
      blocked: true,
      accessError: `当前账号有 ${context.projectCount} 个停用项目待恢复，已暂停生成，请联系管理员恢复。`,
    }
  }
  return { blocked: false, accessError: null }
}

/**
 * @description React Hook：aimprojectworkspace
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimProjectWorkspace(input: { initialProjectId: string; quickMode: boolean }) {
  const { initialProjectId, quickMode } = input
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<ClientProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId)
  const [projectEnabled, setProjectEnabled] = useState(!quickMode)
  const [projectAccessError, setProjectAccessError] = useState<string | null>(null)
  const [projectWorkflowRecords, setProjectWorkflowRecords] = useState<AimGeneration[]>([])
  const [isLoadingProjectWorkflow, setIsLoadingProjectWorkflow] = useState(false)
  // 服务端尚未校验/规范化项目范围之前为 false：防止挂载时用 URL 里的陈旧
  // projectId 抢先发起历史列表请求。
  const [scopeResolved, setScopeResolved] = useState(false)
  const workflowRequestRef = useRef(0)
  const invalidProjectIdRef = useRef<string | null>(null)

  const selectProjectId = useCallback<React.Dispatch<React.SetStateAction<string>>>((value) => {
    invalidProjectIdRef.current = null
    setProjectAccessError(null)
    setSelectedProjectId((current) => {
      const next = typeof value === "function" ? value(current) : value
      return next
    })
  }, [])

  const refreshProjectWorkflow = useCallback(async () => {
    const requestId = ++workflowRequestRef.current
    if (!selectedProjectId) {
      setProjectWorkflowRecords([])
      setIsLoadingProjectWorkflow(false)
      return
    }
    setIsLoadingProjectWorkflow(true)
    try {
      const items = await listAimHistory(1, 50, selectedProjectId)
      if (requestId === workflowRequestRef.current) setProjectWorkflowRecords(items)
    } catch {
      if (requestId === workflowRequestRef.current) setProjectWorkflowRecords([])
    } finally {
      if (requestId === workflowRequestRef.current) setIsLoadingProjectWorkflow(false)
    }
  }, [selectedProjectId])

  const refreshProjects = useCallback(async () => {
    const accountContext = await getAccountProjectContext()
    const gate = describeProjectAccessGate(accountContext)
    if (gate.blocked) {
      setScopeResolved(true)
      setProjects([])
      setProjectEnabled(true)
      setSelectedProjectId("")
      setProjectAccessError(gate.accessError)
      return []
    }
    const items = await listClientProjects()
    setScopeResolved(true)
    setProjects(items)
    if (quickMode) {
      // "直接问"仍在账号绑定的项目上下文中执行；quick 只改变工作流展示，
      // 不能把请求降级为无项目上下文。
      setProjectEnabled(true)
      setSelectedProjectId((current) => selectAuthorizedProjectId(current, items))
      invalidProjectIdRef.current = null
      setProjectAccessError(items.length > 1 ? "账号项目绑定异常，请联系管理员处理。" : null)
      return items
    }
    setProjectEnabled(true)
    setSelectedProjectId((current) => {
      const requested = current || invalidProjectIdRef.current || ""
      const next = selectAuthorizedProjectId(requested, items)
      if (requested && !next) {
        invalidProjectIdRef.current = requested
        setProjectAccessError("这个客户全案已失效或你无权访问，请联系管理员开通权限。")
        return ""
      }
      invalidProjectIdRef.current = null
      setProjectAccessError(null)
      return next
    })
    return items
  }, [quickMode])

  useEffect(() => {
    let active = true
    const task = Promise.resolve().then(refreshProjects)
    void task.catch(() => {
      if (!active) return
      setSelectedProjectId("")
      setProjectEnabled(true)
      setProjectAccessError("账号项目读取失败，请稍后重试。")
    })
    return () => {
      active = false
    }
  }, [quickMode, refreshProjects])

  useEffect(() => {
    if (!scopeResolved) return
    const task = Promise.resolve().then(refreshProjectWorkflow)
    void task
    return () => {
      workflowRequestRef.current += 1
    }
  }, [refreshProjectWorkflow, scopeResolved])

  // 项目范围被服务端规范化后，若地址栏仍残留旧 projectId，用 router.replace
  // （非 push）把查询参数修正为绑定项目——只改 URL，不触发第二次生成/刷新请求。
  useEffect(() => {
    if (!scopeResolved || !selectedProjectId) return
    const urlProjectId = searchParams?.get("projectId") ?? ""
    if (!urlProjectId || urlProjectId === selectedProjectId) return
    const nextParams = new URLSearchParams(searchParams?.toString() ?? "")
    nextParams.set("projectId", selectedProjectId)
    router.replace(`${pathname}?${nextParams.toString()}`)
  }, [pathname, router, scopeResolved, searchParams, selectedProjectId])

  return {
    projects,
    selectedProjectId,
    setSelectedProjectId: selectProjectId,
    projectEnabled,
    setProjectEnabled,
    projectAccessError,
    projectWorkflowRecords,
    isLoadingProjectWorkflow,
    refreshProjectWorkflow,
    refreshProjects,
  }
}
