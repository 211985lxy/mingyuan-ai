import { redirect } from "next/navigation"

export default function AdminAgentsPage() {
  redirect("/admin/audit-center?source=aim&category=execution")
}
