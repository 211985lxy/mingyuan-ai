import { redirect } from "next/navigation"

/** 旧入口保留：跳到知识库并打开会议转写面板 */
export default function MeetingMinutesPage() {
  redirect("/knowledge?intent=meeting")
}
