"use client"

import { useState } from "react"
import { toast } from "sonner"

import { parseAimChatAttachment } from "@/lib/api/aim-attachments"
import { nextAimWorkbenchId } from "@/lib/aim/workbench-helpers"
import { AIM_FILE_ATTACHMENT_MAX_COUNT } from "@/lib/aim/file-attachments"
import type { AimFileAttachment } from "@/lib/aim/workbench-types"

/**
 * @description React Hook：AIM 聊天输入框的文件附件（非图片）：
 *  粘贴/拖入 → 服务端解析为文本 → chip 展示 → 发送时并入用户消息。
 */
export function useAimFileAttachments() {
  const [fileAttachments, setFileAttachments] = useState<AimFileAttachment[]>([])
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)

  async function addFiles(files: File[]) {
    if (files.length === 0) return
    const room = Math.max(0, AIM_FILE_ATTACHMENT_MAX_COUNT - fileAttachments.length)
    if (room < files.length) {
      toast.message(`最多同时携带 ${AIM_FILE_ATTACHMENT_MAX_COUNT} 个文件附件`)
    }
    const pending = files.slice(0, room).map((file) => ({ file, id: nextAimWorkbenchId("file") }))
    if (pending.length === 0) return

    setFileAttachments((current) => [...current, ...pending.map(({ file, id }) => ({
      id,
      name: file.name,
      size: file.size,
      content: "",
      status: "uploading" as const,
    }))])
    setIsUploadingFiles(true)
    try {
      for (const { file, id } of pending) {
        try {
          const parsed = await parseAimChatAttachment(file)
          setFileAttachments((current) => current.map((attachment) => attachment.id === id
            ? { ...attachment, content: parsed.text, status: "ready" }
            : attachment))
          if (parsed.truncated) toast.message(`${file.name} 内容较长，仅保留开头部分`)
        } catch (error) {
          setFileAttachments((current) => current.filter((attachment) => attachment.id !== id))
          toast.error(error instanceof Error ? error.message : `${file.name} 解析失败`)
        }
      }
    } finally {
      setIsUploadingFiles(false)
    }
  }

  return {
    fileAttachments,
    isUploadingFiles,
    addFiles,
    removeFile: (id: string) => setFileAttachments((current) =>
      current.filter((attachment) => attachment.id !== id)),
    clearFiles: () => setFileAttachments([]),
  }
}
