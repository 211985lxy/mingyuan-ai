import { NextResponse } from 'next/server'
import { withUserAuth } from '@/lib/user-auth'
import { createJob, listJobsForUser } from '@/lib/comment-radar/pipeline'
export const GET = withUserAuth(async (_request, { user }) => { const jobs = await listJobsForUser(user.id); return NextResponse.json({ items: jobs }) })
export const POST = withUserAuth(async (request, { user }) => {
  let body: { url?: unknown; accountVideoLimit?: unknown }
  try { body = await request.json() } catch { return NextResponse.json({ error: '请求格式不正确' }, { status: 400 }) }
  const url = typeof body.url === 'string' ? body.url : ''
  if (!url) return NextResponse.json({ error: '请提供链接' }, { status: 400 })
  try { const job = await createJob(user.id, { url, accountVideoLimit: typeof body.accountVideoLimit === 'number' ? body.accountVideoLimit : undefined }); return NextResponse.json({ id: job.id, platform: job.platform, sourceType: job.sourceType, status: job.status }, { status: 201 }) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '创建任务失败' }, { status: 400 }) }
})
