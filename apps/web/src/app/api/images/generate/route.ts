import { NextResponse } from "next/server"
import { buildImageGeneratePrompt, normalizeImageGenerateKind } from "@/lib/image-generate-prompt"

const ARK_IMAGE_URL = "https://ark.cn-beijing.volces.com/api/v3/images/generations"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : ""
  const size = typeof body?.size === "string" ? body.size : "2K"
  const kind = normalizeImageGenerateKind(body?.kind)

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 })
  }

  if (!process.env.ARK_API_KEY) {
    return NextResponse.json({ error: "ARK_API_KEY is required" }, { status: 500 })
  }

  const response = await fetch(ARK_IMAGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.ARK_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128",
      prompt: buildImageGeneratePrompt({ prompt, kind, style: body?.style, layout: body?.layout }),
      sequential_image_generation: "disabled",
      response_format: "url",
      size,
      stream: false,
      watermark: body?.watermark ?? false,
    }),
  })

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    return NextResponse.json(
      { error: data?.error?.message || data?.message || "image generation failed" },
      { status: response.status },
    )
  }

  return NextResponse.json({
    imageUrl: data?.data?.[0]?.url || null,
    kind,
    raw: data,
  })
}
