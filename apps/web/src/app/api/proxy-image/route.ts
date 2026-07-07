import { NextRequest, NextResponse } from "next/server"
import { getImageCandidateUrls, isDomainAllowed } from "./proxy-image-utils"

const MAX_RESPONSE_SIZE = 5 * 1024 * 1024 // 5MB

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")

  if (!url) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 },
    )
  }

  const candidateUrls = getImageCandidateUrls(url)
  let parsed: URL
  try {
    parsed = new URL(candidateUrls[0])
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    return NextResponse.json({ error: "Invalid protocol" }, { status: 400 })
  }

  if (!isDomainAllowed(parsed.hostname)) {
    return NextResponse.json({ error: "Domain not allowed" }, { status: 403 })
  }

  try {
    let upstream: Response | null = null
    for (const targetUrl of candidateUrls) {
      upstream = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://www.douyin.com/",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(10_000),
      })

      if (upstream.ok) break
    }

    if (!upstream?.ok) {
      return NextResponse.json(
        { error: `Upstream responded with ${upstream?.status ?? "unknown"}` },
        { status: 502 },
      )
    }

    const contentType = upstream.headers.get("content-type") ?? ""
    if (!contentType.startsWith("image/")) {
      return NextResponse.json(
        { error: "Response is not an image" },
        { status: 422 },
      )
    }

    const contentLength = upstream.headers.get("content-length")
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        { error: "Image exceeds maximum size" },
        { status: 413 },
      )
    }

    const buffer = await upstream.arrayBuffer()

    if (buffer.byteLength > MAX_RESPONSE_SIZE) {
      return NextResponse.json(
        { error: "Image exceeds maximum size" },
        { status: 413 },
      )
    }

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch image"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
