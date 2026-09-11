import { describe, expect, it } from "vitest"

import {
  FANS_DISTRIBUTION_FIELDS,
  formatDistributionValue,
  parseFansDistribution,
  serializeFansDistribution,
  toBarRatio,
} from "@/lib/data-platform/fans-distribution"

describe("serializeFansDistribution", () => {
  it("序列化为 JSON 文本", () => {
    const text = serializeFansDistribution([
      { value: "男", percent: 0.62 },
      { value: "女", percent: 0.38 },
    ])

    expect(JSON.parse(text)).toEqual([
      { value: "男", percent: 0.62 },
      { value: "女", percent: 0.38 },
    ])
  })

  it("空分布与 null 返回空串", () => {
    expect(serializeFansDistribution([])).toBe("")
    expect(serializeFansDistribution(null)).toBe("")
    expect(serializeFansDistribution(undefined)).toBe("")
  })
})

describe("parseFansDistribution", () => {
  it("解析 JSON 文本", () => {
    expect(parseFansDistribution('[{"value":"河南","percent":0.51}]')).toEqual([
      { value: "河南", percent: 0.51 },
    ])
  })

  it("容忍已是数组的形态（如多维表格返回数组值）", () => {
    expect(parseFansDistribution([{ value: "24-30", percent: 0.31 }])).toEqual([
      { value: "24-30", percent: 0.31 },
    ])
  })

  it("剔除缺字段的条目", () => {
    expect(parseFansDistribution('[{"value":"男","percent":0.6},{"value":"","percent":0.4},{"value":"x"}]')).toEqual([
      { value: "男", percent: 0.6 },
    ])
  })

  it("非法输入返回 null 而不抛错", () => {
    expect(parseFansDistribution("不是 JSON")).toBeNull()
    expect(parseFansDistribution("{}")).toBeNull()
    expect(parseFansDistribution("[]")).toBeNull()
    expect(parseFansDistribution("")).toBeNull()
    expect(parseFansDistribution(null)).toBeNull()
    expect(parseFansDistribution(undefined)).toBeNull()
  })
})

describe("formatDistributionValue", () => {
  it("按数值范围推断语义：(0,1] 视作占比", () => {
    expect(formatDistributionValue(0.62)).toBe("62.0%")
    expect(formatDistributionValue(1)).toBe("100.0%")
  })

  it("[1,100] 视作百分数", () => {
    expect(formatDistributionValue(38)).toBe("38.0%")
    expect(formatDistributionValue(100)).toBe("100.0%")
  })

  it("更大视作绝对数", () => {
    expect(formatDistributionValue(113040)).toBe("113,040")
  })

  it("0 按百分数展示", () => {
    expect(formatDistributionValue(0)).toBe("0.0%")
  })
})

describe("toBarRatio", () => {
  const items = [
    { value: "a", percent: 0.5 },
    { value: "b", percent: 0.25 },
  ]

  it("以本维度最大值为基准归一化", () => {
    expect(toBarRatio(0.5, items)).toBe(1)
    expect(toBarRatio(0.25, items)).toBe(0.5)
  })

  it("全为 0 时返回 0，不产生 NaN", () => {
    expect(toBarRatio(0, [{ value: "a", percent: 0 }])).toBe(0)
  })
})

describe("FANS_DISTRIBUTION_FIELDS", () => {
  it("列名与写入端/读取端约定一致", () => {
    expect(FANS_DISTRIBUTION_FIELDS).toEqual({
      gender: "粉丝性别分布",
      ages: "粉丝年龄分布",
      regions: "粉丝地域分布",
    })
  })
})
