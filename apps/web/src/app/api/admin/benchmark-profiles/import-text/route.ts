import { NextResponse } from "next/server"

import { withAdminAuth } from "@/lib/admin-auth"
import { parseDocument } from "@/lib/document-parser"

interface ImportedTextFile {
  name: string
  text: string
}

function formatImportedTextFile(file: ImportedTextFile): string {
  return `【文件：${file.name}】\n${file.text}`
}

export const POST = withAdminAuth(async (request) => {
  const formData = await request.formData()
  const files = formData.getAll("files").filter((item): item is File => item instanceof File)

  if (files.length === 0) {
    return NextResponse.json({ error: "请上传至少一个文件" }, { status: 400 })
  }

  const parsedFiles: ImportedTextFile[] = []

  for (const file of files) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const chunks = await parseDocument(buffer, file.name)
      const text = chunks.join("\n\n").trim()
      if (text) parsedFiles.push({ name: file.name, text })
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : `${file.name} 解析失败` },
        { status: 400 },
      )
    }
  }

  if (parsedFiles.length === 0) {
    return NextResponse.json({ error: "所有文件内容为空" }, { status: 400 })
  }

  return NextResponse.json({
    data: {
      files: parsedFiles,
      combinedText: parsedFiles.map(formatImportedTextFile).join("\n\n"),
    },
  })
})
