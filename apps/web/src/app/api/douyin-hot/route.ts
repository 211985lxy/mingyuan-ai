import { NextResponse } from "next/server"

/**
 * @description 处理 GET 请求
 * @returns 无返回值
 */
export async function GET() {
  try {
    const res = await fetch("https://v2.xxapi.cn/api/douyinhot", {
      next: { revalidate: 300 },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch douyin hot" },
        { status: 502 }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch douyin hot" },
      { status: 502 }
    )
  }
}
