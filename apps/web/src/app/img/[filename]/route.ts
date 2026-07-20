import { NextRequest, NextResponse } from "next/server"

const LEGACY_ICON_FILES = new Set(["ico.png", "new_ico.0750a9ab.png"])

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params

  if (!LEGACY_ICON_FILES.has(filename)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.redirect(new URL("/logo.png", request.url))
}
