import { redirect } from "next/navigation"

/** 旧「工作总览」入口：统一落到创作台 */
export default function HomePage() {
  redirect("/aim")
}
