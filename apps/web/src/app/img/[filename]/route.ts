import { NextRequest, NextResponse } from "next/server"

const LEGACY_ICON_FILES = new Set(["ico.png", "new_ico.0750a9ab.png"])

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
