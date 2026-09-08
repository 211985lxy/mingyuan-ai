import { redirect } from "next/navigation"

export default function AdminLogsPage() {
  redirect("/admin/audit-center?source=admin&category=operation")
}
