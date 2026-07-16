import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import fs from "fs"
import path from "path"
import { withUserAuth } from "@/lib/user-auth"

export const POST = withUserAuth(async (request: NextRequest) => {
  try {
    const body = await parseJsonRecord(request)
    const { title, content, format = "script" } = body as {
      title?: string
      content?: string
      format?: string
    }

    if (!title || !content) {
      return NextResponse.json(
        { error: "标题和内容不能为空" },
        { status: 400 }
      )
    }

    // 1. 寻找并加载配置 .obsidian-sync.json
    let configFilePath = ""
    const candidates = [
      path.join(process.cwd(), ".obsidian-sync.json"),
      path.join(process.cwd(), "../../", ".obsidian-sync.json"),
      path.join(process.cwd(), "apps/web", ".obsidian-sync.json"),
    ]

    for (const c of candidates) {
      if (fs.existsSync(c)) {
        configFilePath = c
        break
      }
    }

    if (!configFilePath) {
      return NextResponse.json(
        { error: "未找到配置文件 .obsidian-sync.json，请确保在项目根目录运行并进行了初始化。" },
        { status: 404 }
      )
    }

    let config: {
      obsidianVaultPath?: string
      exportDir?: string
    } = {}
    try {
      const fileData = fs.readFileSync(configFilePath, "utf-8")
      config = JSON.parse(fileData)
    } catch (e) {
      return NextResponse.json(
        { error: `读取配置文件失败: ${(e as Error).message}` },
        { status: 500 }
      )
    }

    const { obsidianVaultPath, exportDir = "MingyuanGenerated" } = config

    if (!obsidianVaultPath) {
      return NextResponse.json(
        { error: "未检测到 Obsidian 物理库配置。请在根目录的 .obsidian-sync.json 中配置 obsidianVaultPath 后再试。" },
        { status: 400 }
      )
    }

    if (!fs.existsSync(obsidianVaultPath)) {
      return NextResponse.json(
        { error: `配置的 Obsidian 绝对路径不存在: [${obsidianVaultPath}]，请确认该路径在本地是否真实存在。` },
        { status: 400 }
      )
    }

    // 2. 创建导出目标目录
    const targetFolder = path.join(obsidianVaultPath, exportDir)
    if (!fs.existsSync(targetFolder)) {
      try {
        fs.mkdirSync(targetFolder, { recursive: true })
      } catch (e) {
        return NextResponse.json(
          { error: `创建文案导出目录失败: ${(e as Error).message}` },
          { status: 500 }
        )
      }
    }

    // 3. 构建安全的防重名文件名
    const safeTitle = title.replace(/[\\/:*?"<>|]/g, "-").trim()
    const datePrefix = new Date().toISOString().split("T")[0]
    let fileName = `${datePrefix}-${safeTitle}.md`
    let targetFilePath = path.join(targetFolder, fileName)
    let fileCounter = 1

    while (fs.existsSync(targetFilePath)) {
      fileName = `${datePrefix}-${safeTitle}-${fileCounter}.md`
      targetFilePath = path.join(targetFolder, fileName)
      fileCounter++
    }

    // 4. 构建带 Frontmatter 的漂亮 Markdown 文件正文
    const fileContent = `---
title: "${title}"
category: "generated_content"
format: "${format}"
generatedAt: "${new Date().toISOString()}"
tags:
  - Aim/文案
  - 明远AIM
---

# ${title}

${content}
`

    // 5. 写入本地磁盘
    try {
      fs.writeFileSync(targetFilePath, fileContent, "utf-8")
    } catch (e) {
      return NextResponse.json(
        { error: `写入 Obsidian 文件失败: ${(e as Error).message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      filePath: targetFilePath,
      relativeFilePath: `${exportDir}/${fileName}`,
      fileName,
    })
  } catch (error) {
    console.error("Export to Obsidian error:", error)
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    )
  }
})
