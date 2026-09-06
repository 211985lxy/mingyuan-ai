import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  parseScriptPolishBody,
  runScriptPolish,
} from "@/lib/aim/services/script-polish"
import { resolveBoundProject } from "@/lib/account-project-context"

export const maxDuration = 60

export const POST = withUserAuth(async (request, { user }) => {
  const body = await parseJsonRecord(request)
  const input = parseScriptPolishBody(body)
  const project = await resolveBoundProject({ userId: user.id, requestedProjectId: input.projectId })
  const result = await runScriptPolish(user.id, { ...input, projectId: project.id })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ data: result.data })
})
