import {
  createClientProject,
  type ClientProject,
} from "@/lib/api/client"

const DEFAULT_ACCOUNT_NAME = "我的账户"

/**
 * 单账户默认壳：若没有 active 项目则自动创建一个「我的账户」，
 * 供知识绑定使用，避免用户先填全案表单。
 */
export async function ensureDefaultAccountProject(
  projects: ClientProject[],
): Promise<{ project: ClientProject; created: boolean }> {
  const active = projects.find((project) => project.status === "active")
  if (active) return { project: active, created: false }

  const named = projects.find((project) => project.name.trim() === DEFAULT_ACCOUNT_NAME)
  if (named) return { project: named, created: false }

  const created = await createClientProject({ name: DEFAULT_ACCOUNT_NAME })
  return { project: created, created: true }
}
