import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/env", () => ({ env: {} }))
vi.mock("@/lib/lark-base", () => ({
  listLarkBaseRecords: vi.fn(),
  updateLarkBaseRecord: vi.fn(),
}))

import { fetchDouyinFansProfile, type DouyinToken } from "@/lib/douyin-openapi"

const TOKEN: DouyinToken = {
  accessToken: "act.sample-token",
  refreshToken: "rft.sample",
  openId: "ba253642-0590-40bc-9bdf-9a1334b94059",
  unionId: null,
  expiresIn: 15 * 86400,
  scope: "user_info,video.list,fans.data.bind",
}

/** 官方 /user/fans_data/ 的响应样例（字段名取自接口文档） */
const DOC_SAMPLE = {
  data: {
    description: "",
    error_code: 0,
    fans_data: {
      all_fans_num: 113040,
      gender_distributions: [
        { item: "男", value: 0.62 },
        { item: "女", value: 0.38 },
      ],
      age_distributions: [
        { item: "24-30", value: 0.31 },
        { item: "31-40", value: 0.44 },
      ],
      geographical_distributions: [
        { item: "河南", value: 0.51 },
        { item: "山东", value: 0.12 },
      ],
      interest_distributions: [{ item: "家装", value: 0.22 }],
      active_days_distributions: [{ item: "7天", value: 0.66 }],
      device_distributions: [{ item: "iPhone", value: 0.4 }],
    },
  },
}

function mockFetch(payload: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fn = vi.fn(async () => ({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    text: async () => JSON.stringify(payload),
  }))
  vi.stubGlobal("fetch", fn)
  return fn
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("fetchDouyinFansProfile", () => {
  it("调用官方 /user/fans_data/ 接口，access-token 走请求头、open_id 走查询参数", async () => {
    const fetchMock = mockFetch(DOC_SAMPLE)

    await fetchDouyinFansProfile(TOKEN)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain("/api/douyin/v1/user/fans_data/")
    expect(url).toContain(`open_id=${encodeURIComponent(TOKEN.openId)}`)
    // 旧实现把 token 放在 query 上，官方要求放 access-token 请求头
    expect(url).not.toContain("access_token=")
    const headers = init.headers as Record<string, string>
    expect(headers["access-token"]).toBe(TOKEN.accessToken)
    expect(headers["content-type"]).toBe("application/json")
  })

  it("把 fans_data 的 distributions 解析成 { value, percent }", async () => {
    mockFetch(DOC_SAMPLE)

    const profile = await fetchDouyinFansProfile(TOKEN)

    expect(profile).not.toBeNull()
    expect(profile?.allFansNum).toBe(113040)
    expect(profile?.gender).toEqual([
      { value: "男", percent: 0.62 },
      { value: "女", percent: 0.38 },
    ])
    expect(profile?.ages?.[1]).toEqual({ value: "31-40", percent: 0.44 })
    expect(profile?.provinces?.[0]).toEqual({ value: "河南", percent: 0.51 })
    expect(profile?.interests).toEqual([{ value: "家装", percent: 0.22 }])
    expect(profile?.devices).toEqual([{ value: "iPhone", percent: 0.4 }])
  })

  it("缺席维度返回 null，不抛错", async () => {
    mockFetch({ data: { fans_data: { gender_distributions: [{ item: "男", value: 1 }] } } })

    const profile = await fetchDouyinFansProfile(TOKEN)

    expect(profile?.gender).toEqual([{ value: "男", percent: 1 }])
    expect(profile?.ages).toBeNull()
    expect(profile?.allFansNum).toBeNull()
  })

  it("未获批能力（无 fans_data）时返回 null", async () => {
    mockFetch({ data: { error_code: 28001018, description: "应用未获得该能力" } })

    expect(await fetchDouyinFansProfile(TOKEN)).toBeNull()
  })

  it("HTTP 失败时返回 null 而非抛错", async () => {
    mockFetch({}, { ok: false, status: 500 })

    expect(await fetchDouyinFansProfile(TOKEN)).toBeNull()
  })
})
