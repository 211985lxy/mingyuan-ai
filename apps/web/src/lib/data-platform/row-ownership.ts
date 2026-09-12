/**
 * 飞书数据看板仓库（`LARK_PLATFORM_*`）的行归属口径。
 *
 * 背景：这是一张**共享仓库**——既承载官方 OAuth 绑定写入的「自有账号」，也承载
 * 第三方采集写入的对标账号。此前 `/api/data-platform/summary` 不做任何过滤，
 * 任何登录用户都能看到全部账号与作品；多客户场景下会互相看到对方数据。
 *
 * 隔离口径：按「项目」隔离。产品模型是「一个 AIM 登录账号绑定一个 IP 项目」，
 * 且同项目允许多账号共绑（团队协作），所以项目才是正确的隔离边界。
 *
 *  - 归属列为空 → 视为**共享数据**（对标/采集来源），所有人可见
 *  - 归属列有值 → **仅该项目可见**
 *
 * 选这个口径的关键好处是**存量行为不变**：历史行（含采集来的对标账号）没有归属列，
 * 仍按共享展示；只有今后官方绑定写入的自有数据才是项目私有的。
 */

export const ROW_OWNERSHIP_FIELD = "所属项目ID"

/** 读取归属值：飞书文本列可能返回字符串或数组。 */
export function readRowOwner(fields: Record<string, unknown>): string {
  const value = fields[ROW_OWNERSHIP_FIELD]
  if (value == null) return ""
  return (Array.isArray(value) ? value.map((x) => String(x)).join(" ") : String(value)).trim()
}

/** 该行是否对该项目可见。projectId 为 null（账号未绑定项目）时只看得到共享行。 */
export function isRowVisibleToProject(
  fields: Record<string, unknown>,
  projectId: string | null,
): boolean {
  const owner = readRowOwner(fields)
  if (!owner) return true
  return projectId != null && owner === projectId
}
