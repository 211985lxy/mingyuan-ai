"use client"

import { useState } from "react"
import { toast } from "sonner"
import { uploadImageForAimChat } from "@/lib/api/client"
import { nextAimMessageId } from "@/features/aim/aim-id"
import type { AimImageAttachment } from "@/features/aim/aim-workbench-types"

export function useAimImageAttachments() {
  const [imageAttachments, setImageAttachments] = useState<AimImageAttachment[]>([])
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  async function handleAddImages(files: FileList) {
    const nextImages: AimImageAttachment[] = []
    setIsUploadingImage(true)
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} 不是图片文件`)
          continue
        }
        if (file.size > 8 * 1024 * 1024) {
          toast.error(`${file.name} 超过 8MB`)
          continue
        }
        const uploaded = await uploadImageForAimChat(file)
        nextImages.push({
          id: nextAimMessageId("img"),
          name: file.name,
          assetUrl: uploaded.assetUrl,
          readUrl: uploaded.readUrl,
          previewUrl: uploaded.readUrl,
        })
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "图片上传失败")
    } finally {
      setIsUploadingImage(false)
    }
    if (nextImages.length) setImageAttachments((current) => [...current, ...nextImages].slice(-4))
  }

  return {
    imageAttachments,
    setImageAttachments,
    isUploadingImage,
    handleAddImages,
  }
}
