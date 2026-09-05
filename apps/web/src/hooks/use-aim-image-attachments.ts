"use client"

import { useState } from "react"
import { toast } from "sonner"

import { uploadImageForAimChat } from "@/lib/api/client"
import { nextAimWorkbenchId } from "@/lib/aim/workbench-helpers"
import type { AimImageAttachment } from "@/lib/aim/workbench-types"

/**
 * @description React Hook：aimimageattachments
 * @returns 无返回值
 */
export function useAimImageAttachments() {
  const [imageAttachments, setImageAttachments] = useState<AimImageAttachment[]>([])
  const [isUploadingImage, setIsUploadingImage] = useState(false)

  async function addImages(files: FileList | File[]) {
    const uploadedImages: AimImageAttachment[] = []
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
        uploadedImages.push({
          id: nextAimWorkbenchId("img"),
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
    if (uploadedImages.length) setImageAttachments((current) => [...current, ...uploadedImages].slice(-4))
  }

  return {
    imageAttachments,
    isUploadingImage,
    addImages,
    removeImage: (id: string) => setImageAttachments((current) => current.filter((image) => image.id !== id)),
    clearImages: () => setImageAttachments([]),
  }
}
