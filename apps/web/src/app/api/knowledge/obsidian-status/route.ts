import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

/**
 * @description 处理 GET 请求
 * @returns 无返回值
 */
export async function GET() {
  try {
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
      return NextResponse.json({
        isPhysicalMode: false,
        obsidianVaultPath: "",
      })
    }

    const fileData = fs.readFileSync(configFilePath, "utf-8")
    const config = JSON.parse(fileData)

    const vaultPath = config.obsidianVaultPath || ""
    const isPhysicalMode = !!vaultPath && fs.existsSync(vaultPath)

    return NextResponse.json({
      isPhysicalMode,
      obsidianVaultPath: vaultPath,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error", details: (error as Error).message },
      { status: 500 }
    )
  }
}
