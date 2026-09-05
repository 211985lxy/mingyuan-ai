/**
 * 抖音数据回流到飞书 Base（账号总表 + 视频数据表）。
 * 从 douyin-openapi.ts 拆出（arch:size 500 行上限）；对外契约经原文件 re-export 保持不变。
 * 用账号 open_id / 视频 itemId 当唯一键，重复写入时自动更新（upsert 语义）。
 */
import { env } from "@/env"
import { updateLarkBaseRecord, listLarkBaseRecords } from "@/lib/lark-base"
import type { DouyinToken, DouyinUserProfile, DouyinVideo } from "@/lib/douyin-openapi"

type SyncToLarkInput = { baseToken: string; profile: DouyinUserProfile; token: DouyinToken; identity: "user" | "bot" }

async function upsertDouyinAccountRow(accountTableId: string, input: SyncToLarkInput): Promise<number> {
  const fields: Record<string, unknown> = {
    平台账号ID: input.profile.openId,
    平台: "抖音",
    账号昵称: input.profile.nickname,
    头像URL: input.profile.avatar || "",
    粉丝总数: input.profile.followers ?? 0,
    关注总数: input.profile.following ?? 0,
    获赞收藏总数: input.profile.totalFavorited ?? 0,
    作品总数: input.profile.awemeCount ?? 0,
    接入方式: "官方API",
    账号状态: "正常",
    授权有效期至: new Date(Date.now() + (input.token.expiresIn ?? 15 * 86400) * 1000).toISOString(),
    主页链接: input.profile.nickname
      ? `https://www.douyin.com/search/${encodeURIComponent(input.profile.nickname)}`
      : "",
  }
  try {
    const existing = await listLarkBaseRecords({ baseToken: input.baseToken, tableId: accountTableId, limit: 5, identity: input.identity }).catch(() => [])
    const match = existing.find((row) => String(row.fields["平台账号ID"] ?? row.fields["账号ID"] ?? "") === input.profile.openId)
    await updateLarkBaseRecord({
      baseToken: input.baseToken, tableId: accountTableId,
      recordId: match?.recordId ?? `douyin-${input.profile.openId}`,
      fields, identity: input.identity,
    })
    return 1
  } catch (err) {
    console.error("[douyin-openapi] 账号表写入飞书失败:", err instanceof Error ? err.message : err)
    return 0
  }
}

async function writeDouyinVideoRow(videoTableId: string, video: DouyinVideo, input: SyncToLarkInput): Promise<number> {
  const fields: Record<string, unknown> = {
    视频ID: video.itemId,
    平台: "抖音",
    标题: video.title,
    封面URL: video.coverUrl || "",
    发布时间: video.createTime ? new Date(video.createTime * 1000).toISOString() : "",
    播放量: video.statistics?.playCount ?? 0,
    点赞数: video.statistics?.diggCount ?? 0,
    评论数: video.statistics?.commentCount ?? 0,
    收藏数: video.statistics?.collectCount ?? 0,
    转发数: video.statistics?.shareCount ?? 0,
  }
  try {
    const existing = await listLarkBaseRecords({ baseToken: input.baseToken, tableId: videoTableId, limit: 5, identity: input.identity }).catch(() => [])
    const match = existing.find((row) => String(row.fields["视频ID"] ?? row.fields["笔记ID"] ?? "") === video.itemId)
    await updateLarkBaseRecord({ baseToken: input.baseToken, tableId: videoTableId, recordId: match?.recordId ?? `douyin-video-${video.itemId}`, fields, identity: input.identity })
    return 1
  } catch (err) {
    console.warn(`[douyin-openapi] 视频 ${video.itemId} 写入失败:`, err instanceof Error ? err.message : err)
    return 0
  }
}

/**
 * 把抖音拉到的账号/视频数据写入飞书多维表格的账号总表和视频数据表。
 * 用账号 open_id / 视频 itemId 当唯一键，重复写入时自动更新（upsert 语义）。
 */
export async function syncDouyinDataToLarkBase(input: {
  profile: DouyinUserProfile
  videos: DouyinVideo[]
  token: DouyinToken
  identity?: "user" | "bot"
}): Promise<{ accounts: number; videos: number; fansWritten: boolean }> {
  const baseToken = env.LARK_PLATFORM_DATA_BASE_TOKEN?.trim()
  const accountTableId = env.LARK_PLATFORM_ACCOUNT_TABLE_ID?.trim()
  const videoTableId = env.LARK_PLATFORM_VIDEO_TABLE_ID?.trim()
  if (!baseToken) throw new Error("未配置 LARK_PLATFORM_DATA_BASE_TOKEN，无法把抖音数据写入飞书 Base。")

  const identity = input.identity ?? "bot"
  const larkInput: SyncToLarkInput = { baseToken, profile: input.profile, token: input.token, identity }
  const writtenAccounts = accountTableId ? await upsertDouyinAccountRow(accountTableId, larkInput) : 0

  let writtenVideos = 0
  if (videoTableId) {
    for (const v of input.videos) {
      writtenVideos += await writeDouyinVideoRow(videoTableId, v, larkInput)
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  return { accounts: writtenAccounts, videos: writtenVideos, fansWritten: true }
}
