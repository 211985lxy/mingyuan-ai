import { redirect } from "next/navigation"

export default function AdminUsagePage() {
  redirect("/admin/audit-center?source=agent_api&category=model_call")
}
