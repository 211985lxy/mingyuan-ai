"use client"

import { useState, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"

import { parseAimChatAttachment, transcribeAimAudioAttachment } from "@/lib/api/aim-attachments"
import { uploadFileToStorage } from "@/lib/api/media"
import { nextAimWorkbenchId } from "@/lib/aim/workbench-helpers"
import {
  AIM_AUDIO_MAX_MINUTES,
  AIM_FILE_ATTACHMENT_MAX_COUNT,
  isAudioFile,
  readAudioDurationSeconds,
} from "@/lib/aim/file-attachments"
import type { AimFileAttachment } from "@/lib/aim/workbench-types"

/** 音频时长超限则提示并返回 false（不占 chip 位）。 */
async function audioWithinLimit(file: File): Promise<boolean> {
  const seconds = await readAudioDurationSeconds(file)
  if (seconds === null) return true // 读不到时长按放行处理，交给 ASR 边界
  const minutes = Math.ceil(seconds / 60)
  if (minutes > AIM_AUDIO_MAX_MINUTES) {
    toast.error(`${file.name} 超过 ${AIM_AUDIO_MAX_MINUTES} 分钟，暂不支持自动转写`)
    return false
  }
  return true
}

function setAttachmentStatus(
  setFileAttachments: Dispatch<SetStateAction<AimFileAttachment[]>>,
  id: string,
  patch: Partial<AimFileAttachment>,
) {
  setFileAttachments((current) => current.map((attachment) => attachment.id === id
    ? { ...attachment, ...patch }
    : attachment))
}

function dropAttachment(
  setFileAttachments: Dispatch<SetStateAction<AimFileAttachment[]>>,
  id: string,
  reason: unknown,
  fallbackName: string,
) {
  setFileAttachments((current) => current.filter((attachment) => attachment.id !== id))
  toast.error(reason instanceof Error ? reason.message : `${fallbackName} 处理失败`)
}

async function ingestAudioAttachment(
  setFileAttachments: Dispatch<SetStateAction<AimFileAttachment[]>>,
  id: string,
  file: File,
) {
  if (!(await audioWithinLimit(file))) {
    setFileAttachments((current) => current.filter((attachment) => attachment.id !== id))
    return
  }
  const uploaded = await uploadFileToStorage(file, { assetType: "audio" })
  const { text } = await transcribeAimAudioAttachment({
    audioUrl: uploaded.assetUrl,
    name: file.name,
  })
  setAttachmentStatus(setFileAttachments, id, { content: text, status: "ready", kind: "audio" })
}

async function ingestDocumentAttachment(
  setFileAttachments: Dispatch<SetStateAction<AimFileAttachment[]>>,
  id: string,
  file: File,
) {
  const parsed = await parseAimChatAttachment(file)
  setAttachmentStatus(setFileAttachments, id, { content: parsed.text, status: "ready" })
  if (parsed.truncated) toast.message(`${file.name} 内容较长，仅保留开头部分`)
}

/**
 * @description React Hook：AIM 聊天输入框的文件附件（非图片）：
 *  粘贴/拖入 → 文档解析为文本 / 音频上传并自动转写 → chip 展示 → 发送时并入用户消息。
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
      kind: isAudioFile(file) ? ("audio" as const) : undefined,
    }))])
    setIsUploadingFiles(true)
    try {
      for (const { file, id } of pending) {
        try {
          if (isAudioFile(file)) await ingestAudioAttachment(setFileAttachments, id, file)
          else await ingestDocumentAttachment(setFileAttachments, id, file)
        } catch (error) {
          dropAttachment(setFileAttachments, id, error, file.name)
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
