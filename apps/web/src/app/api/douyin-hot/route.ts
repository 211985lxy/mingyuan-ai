import { NextResponse } from "next/server"

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
