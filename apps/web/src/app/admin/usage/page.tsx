import { redirect } from "next/navigation"

export default function AdminUsagePage() {
  redirect("/admin/statistics?section=cost")
}
