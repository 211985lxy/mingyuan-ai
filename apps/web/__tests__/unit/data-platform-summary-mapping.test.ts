import { describe, expect, it } from "vitest"

import {
  pickNumber,
  pickText,
  splitTags,
  toPlatformAccount,
  toPlatformVideo,
} from "@/lib/data-platform/summary-mapping"

/** 第三方采集写入的「达人*」字段组（取自线上账号表真实一行，脱敏后原样保留字段名） */
const SCRAPED_ROW = {
  recordId: "recvujXomTAa9X",
  fields: {
    平台账号ID: "",
    达人UID: "936405856948781",
    获赞: 328419,
    粉丝数: 113040,
    达人链接: "https://www.douyin.com/user/MS4wLjABAAAAsample",
    账号昵称: "",
    获赞收藏总数: 328419,
    关注: 33,
    账号认证: "某节能科技有限公司",
    平台: "",
    抖音号: "sampleaccount",
    达人昵称: "博容老申聊暖通",
    作品总数: 742,
    达人加密UID: "MS4wLjABAAAAsample",
  } as Record<string, unknown>,
}

/** 官方 OAuth 绑定写入的「账号*」字段组 */
const OAUTH_ROW = {
  recordId: "douyin-open-1",
  fields: {
    平台账号ID: "open-1",
    平台: "抖音",
    账号昵称: "官方绑定号",
    头像URL: "https://example.com/a.png",
    粉丝总数: 1234,
    关注总数: 12,
    获赞收藏总数: 9999,
    作品总数: 42,
    接入方式: "官方API",
    账号状态: "正常",
    授权有效期至: "2026-10-01T00:00:00.000Z",
    主页链接: "https://www.douyin.com/user/sample",
  } as Record<string, unknown>,
}

describe("pickText / pickNumber", () => {
  it("取第一个非空候选，跳过空白与空串", () => {
    expect(pickText({ a: "  ", b: "值" }, ["a", "b"])).toBe("值")
    expect(pickText({}, ["a", "b"])).toBeNull()
  })

  it("数组值拼接为文本", () => {
    expect(pickText({ a: ["x", "y"] }, ["a"])).toBe("x y")
  })

  it("区分未填写与真实的 0", () => {
    expect(pickNumber({ a: "" }, ["a"])).toBeNull()
    expect(pickNumber({ a: 0 }, ["a"])).toBe(0)
    expect(pickNumber({ a: "0" }, ["a"])).toBe(0)
  })

  it("支持千分位字符串", () => {
    expect(pickNumber({ a: "113,040" }, ["a"])).toBe(113040)
  })
})

describe("splitTags", () => {
  it("按中英文分隔符切分并去空", () => {
    expect(splitTags("a, b、c")).toEqual(["a", "b", "c"])
    expect(splitTags(["a", " b "])).toEqual(["a", "b"])
    expect(splitTags(null)).toBeNull()
  })
})

describe("toPlatformAccount", () => {
  it("识别采集来源的「达人*」字段（回归：此前显示为「未命名账号」）", () => {
    const account = toPlatformAccount(SCRAPED_ROW)

    expect(account.nickname).toBe("博容老申聊暖通")
    expect(account.id).toBe("936405856948781")
    expect(account.fansCount).toBe(113040)
    expect(account.followCount).toBe(33)
    expect(account.likeCount).toBe(328419)
    expect(account.workCount).toBe(742)
    expect(account.homeLink).toBe("https://www.douyin.com/user/MS4wLjABAAAAsample")
    expect(account.authStatus).toBe("某节能科技有限公司")
    // 该行「平台」列为空，但填了「抖音号」→ 判定为抖音
    expect(account.platform).toBe("抖音")
  })

  it("无显式平台字段时按抖音号推断平台", () => {
    expect(toPlatformAccount({ recordId: "r1", fields: { 抖音号: "abc" } }).platform).toBe("抖音")
    expect(toPlatformAccount({ recordId: "r2", fields: { 达人昵称: "无号账号" } }).platform).toBe("其他")
  })

  it("显式平台字段优先于推断", () => {
    const account = toPlatformAccount({ recordId: "r3", fields: { 平台: "视频号", 抖音号: "abc" } })

    expect(account.platform).toBe("视频号")
  })

  it("官方绑定字段照常映射", () => {
    const account = toPlatformAccount(OAUTH_ROW)

    expect(account.nickname).toBe("官方绑定号")
    expect(account.id).toBe("open-1")
    expect(account.platform).toBe("抖音")
    expect(account.fansCount).toBe(1234)
    expect(account.accessType).toBe("官方API")
    expect(account.expireAt).toBe("2026-10-01T00:00:00.000Z")
  })

  it("官方字段优先于采集字段", () => {
    const account = toPlatformAccount({
      recordId: "both-1",
      fields: { 账号昵称: "官方名", 达人昵称: "采集名", 粉丝总数: 1, 粉丝数: 2 },
    })

    expect(account.nickname).toBe("官方名")
    expect(account.fansCount).toBe(1)
  })

  it("解析账号表里的粉丝画像分布列", () => {
    const account = toPlatformAccount({
      recordId: "fans-1",
      fields: {
        账号昵称: "有画像的号",
        粉丝性别分布: '[{"value":"男","percent":0.62},{"value":"女","percent":0.38}]',
        粉丝年龄分布: '[{"value":"24-30","percent":0.31}]',
        粉丝地域分布: "不是 JSON",
      },
    })

    expect(account.fansGender).toEqual([
      { value: "男", percent: 0.62 },
      { value: "女", percent: 0.38 },
    ])
    expect(account.fansAges).toEqual([{ value: "24-30", percent: 0.31 }])
    expect(account.fansRegions).toBeNull()
  })

  it("未获批粉丝画像时三个分布字段均为 null（看板据此不渲染该块）", () => {
    const account = toPlatformAccount(OAUTH_ROW)

    expect(account.fansGender).toBeNull()
    expect(account.fansAges).toBeNull()
    expect(account.fansRegions).toBeNull()
  })

  it("两套字段都缺时回退到 recordId 与占位昵称", () => {
    const account = toPlatformAccount({ recordId: "rec-9", fields: {} })

    expect(account.nickname).toBe("未命名账号")
    expect(account.id).toBe("rec-9")
    expect(account.platform).toBe("其他")
  })
})

describe("toPlatformVideo", () => {
  it("映射官方绑定写入的视频字段", () => {
    const video = toPlatformVideo({
      recordId: "v-1",
      fields: {
        视频ID: "7491",
        平台: "抖音",
        标题: "测试作品",
        发布时间: "2026-09-01T00:00:00.000Z",
        播放量: 12000,
        点赞数: 86,
        评论数: 14,
        收藏数: 31,
        转发数: 9,
        完播率: 0.42,
      },
    })

    expect(video.id).toBe("7491")
    expect(video.platform).toBe("抖音")
    expect(video.title).toBe("测试作品")
    expect(video.playCount).toBe(12000)
    expect(video.commentCount).toBe(14)
    expect(video.completionRate).toBe(0.42)
  })

  it("缺标题与平台时给出占位值", () => {
    const video = toPlatformVideo({ recordId: "v-2", fields: {} })

    expect(video.title).toBe("未命名作品")
    expect(video.platform).toBe("抖音")
    expect(video.id).toBe("v-2")
  })
})
