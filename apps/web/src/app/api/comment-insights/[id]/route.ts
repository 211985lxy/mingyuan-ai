import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, authErrorResponse } from '@/lib/user-auth'
import { getJobForUser, listCommentsForJob } from '@/lib/comment-radar/pipeline'

export async function GET(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  let user: { id: string; email: string }
  try {
    user = await authenticateRequest(request)
  } catch (error) {
    const resp = authErrorResponse(error)
    if (resp) return resp
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
  const p = await params
  const id = p.id
  const url = new URL(request.url)
  if (url.searchParams.has('comments')) {
    const page = Number(url.searchParams.get('page')) || 1
    const pageSize = Number(url.searchParams.get('pageSize')) || 50
    const keyword = url.searchParams.get('keyword') || undefined
    const sortBy = url.searchParams.get('sortBy') === 'likes' ? 'likes' : 'createTime'
    const sortOrder = url.searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc'
    const sourceItemId = url.searchParams.get('sourceItemId') || undefined
    const result = await listCommentsForJob(user.id, id, { page, pageSize, keyword, sortBy, sortOrder, sourceItemId })
    if (!result) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
    return NextResponse.json(result)
  }
  const job = await getJobForUser(user.id, id)
  if (!job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(job)
}
