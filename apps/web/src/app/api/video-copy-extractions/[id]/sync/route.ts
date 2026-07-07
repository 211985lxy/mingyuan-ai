import { NextResponse } from "next/server"
import {
  serializeVideoCopyExtraction,
  syncVideoCopyExtraction,
} from "@/lib/video-copy-extractions"
import { withUserAuth } from "@/lib/user-auth"

export const POST = withUserAuth(async (_request, { user, params }) => {
  const id = (params as { id: string }).id
  const record = await syncVideoCopyExtraction(user.id, id)

  if (!record) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 })
  }

  return NextResponse.json(serializeVideoCopyExtraction(record))
})
