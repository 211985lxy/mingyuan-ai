/**
 * 作品/笔记级评论拉取模块。
 *
 * 基于 RedFox API 获取单条抖音作品或小红书笔记的评论。
 * 只支持「用户主动点开某条作品/笔记」场景，不自动批量采集。
 *
 * 抖音用 offset 分页，小红书用 cursor 分页，统一封装。
 */

import { redfoxPost, hasRedFoxApiKey } from './client'

// ── 类型 ──

export type CommentPlatform = 'douyin' | 'xiaohongshu'

export interface CommentItem {
  /** 评论 ID */
  commentId: string
  /** 评论内容 */
  text: string
  /** 点赞数 */
  likes: number
  /** 评论时间 */
  createTime: string
  /** 是否置顶 */
  isTop: boolean
  /** 评论者昵称 */
  nickname?: string
  /** 评论者头像 */
  avatar?: string
}

export interface CommentPage {
  items: CommentItem[]
  /** 是否有更多评论 */
  hasMore: boolean
  /** 下一页游标（抖音为 offset，小红书为 cursor） */
  nextCursor: number | string
}

// ── 抖音评论 RedFox 响应 ──

interface RedFoxDouyinCommentResponse {
  comments?: RedFoxDouyinComment[]
  hasMore?: boolean
  cursor?: number
  totalCount?: number
}

interface RedFoxDouyinComment {
  commentId?: string
  text?: string
  diggCount?: number
  createTime?: string
  isTop?: boolean
  nickname?: string
  avatarUrl?: string
}

// ── 小红书评论 RedFox 响应 ──

interface RedFoxXhsCommentResponse {
  comments?: RedFoxXhsComment[]
  hasMore?: boolean
  cursor?: string
  totalCount?: number
}

interface RedFoxXhsComment {
  commentId?: string
  content?: string
  likeCount?: number
  createTime?: string
  ipLocation?: string
  nickname?: string
  avatar?: string
}

// ── 核心方法 ──

/**
 * 拉取单条作品/笔记的评论（第一页或指定页）。
 *
 * @param platform 平台（douyin | xiaohongshu）
 * @param itemId 作品ID / 笔记ID
 * @param cursorOrOffset 分页游标：抖音用数字 offset，小红书用字符串 cursor
 */
/**
 * @description 请求获取redfoxcomments
 * @param input - 输入数据
 * @returns Promise<CommentPage>
 */
export async function fetchRedFoxComments(input: {
  platform: CommentPlatform
  itemId: string
  cursorOrOffset?: number | string
}): Promise<CommentPage> {
  const { platform, itemId, cursorOrOffset } = input

  if (!itemId.trim()) {
    throw new Error('请提供作品或笔记 ID')
  }

  if (!hasRedFoxApiKey()) {
    throw new Error('未配置 REDFOX_API_KEY，无法拉取评论')
  }

  if (platform === 'xiaohongshu') {
    return fetchXhsComments(itemId, typeof cursorOrOffset === 'string' ? cursorOrOffset : undefined)
  }
  return fetchDouyinComments(itemId, typeof cursorOrOffset === 'number' ? cursorOrOffset : 0)
}

/**
 * 检查评论 API 是否可用。
 */
/**
 * @description 判断是否包含commentapi
 * @returns boolean
 */
export function hasCommentApi(): boolean {
  return hasRedFoxApiKey()
}

// ── 抖音评论 ──

async function fetchDouyinComments(
  itemId: string,
  offset: number,
): Promise<CommentPage> {
  const body: Record<string, unknown> = {
    awemeId: itemId,
    offset,
    count: 20,
  }

  const data = await redfoxPost<RedFoxDouyinCommentResponse>(
    '/story/api/dy/work/comment',
    body,
  )

  const items = Array.isArray(data.comments)
    ? data.comments.map(normalizeDouyinComment).filter((c): c is CommentItem => Boolean(c))
    : []

  return {
    items,
    hasMore: Boolean(data.hasMore),
    nextCursor: typeof data.cursor === 'number' ? data.cursor : offset + items.length,
  }
}

// ── 小红书评论 ──

async function fetchXhsComments(
  itemId: string,
  cursor?: string,
): Promise<CommentPage> {
  const body: Record<string, unknown> = {
    noteId: itemId,
    count: 20,
  }
  if (cursor) body.cursor = cursor

  const data = await redfoxPost<RedFoxXhsCommentResponse>(
    '/story/api/xhs/ability/commentList',
    body,
  )

  const items = Array.isArray(data.comments)
    ? data.comments.map(normalizeXhsComment).filter((c): c is CommentItem => Boolean(c))
    : []

  return {
    items,
    hasMore: Boolean(data.hasMore),
    nextCursor: data.cursor || '',
  }
}

// ── 归一化 ──

function normalizeDouyinComment(comment: RedFoxDouyinComment): CommentItem | null {
  if (!comment.commentId && !comment.text) return null
  return {
    commentId: comment.commentId || '',
    text: comment.text || '',
    likes: numberValue(comment.diggCount),
    createTime: comment.createTime || '',
    isTop: Boolean(comment.isTop),
    nickname: comment.nickname,
    avatar: comment.avatarUrl,
  }
}

function normalizeXhsComment(comment: RedFoxXhsComment): CommentItem | null {
  if (!comment.commentId && !comment.content) return null
  return {
    commentId: comment.commentId || '',
    text: comment.content || '',
    likes: numberValue(comment.likeCount),
    createTime: comment.createTime || '',
    isTop: false,
    nickname: comment.nickname,
    avatar: comment.avatar,
  }
}

function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}
