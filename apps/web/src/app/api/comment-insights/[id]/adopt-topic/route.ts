import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, authErrorResponse } from '@/lib/user-auth'
import { adoptTopicSchema } from '@/lib/comment-radar/schemas'
import { prisma } from '@/lib/prisma'
import type { JobStatus } from '@/lib/comment-radar/types'
import { apiRequestErrorResponse, parseJsonRecord } from '@/lib/api-contract'

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function POST(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  let user: { id: string; email: string }
  try { user = await authenticateRequest(request) } catch (e) { const r = authErrorResponse(e); if (r) return r; return NextResponse.json({ error: 'Internal error' }, { status: 500 }) }
  const p = await params
  const job = await prisma.commentInsightJob.findFirst({ where: { id: p.id, userId: user.id } })
  if (!job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  const st = job.status as JobStatus
  if (st !== 'completed' && st !== 'partial') return NextResponse.json({ error: 'Job has not been analyzed yet' }, { status: 400 })
  if (!job.analysisResult) return NextResponse.json({ error: 'No analysis result' }, { status: 400 })
  let body: unknown
  try { body = await parseJsonRecord(request) } catch (error) { return apiRequestErrorResponse(request, error) ?? NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const parsed = adoptTopicSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  const existing = (job.analysisResult as Record<string, unknown>) ?? {}
  await prisma.commentInsightJob.update({ where: { id: p.id }, data: { analysisResult: { ...existing, adoptedTopic: parsed.data } } })
  return NextResponse.json({ adopted: parsed.data })
}
