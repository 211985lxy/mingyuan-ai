/**
 * 内容选题核验 fixture（正本：成功 / 不足 / 工具失败各 ≥3）。
 */

import type { ContentTopicVerifierInput } from "./verifier"
import { verifyContentTopic } from "./verifier"

export type ContentTopicFixtureKind = "success" | "insufficient" | "tool_failed"

export interface ContentTopicFixture {
  id: string
  kind: ContentTopicFixtureKind
  input: ContentTopicVerifierInput
  expectStatus: "pass" | "needs_human" | "fail"
}

export const CONTENT_TOPIC_FIXTURES: readonly ContentTopicFixture[] = Object.freeze([
  {
    id: "content_topic_success_quote",
    kind: "success",
    expectStatus: "pass",
    input: {
      projectId: "proj_content_1",
      sourceText: "群里说下周要做敏感肌美白选题，主打职场通勤场景，强调温和不刺激。",
      candidates: [
        {
          title: "敏感肌通勤美白",
          evidenceQuotes: ["敏感肌美白选题", "职场通勤场景"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_success_multi",
    kind: "success",
    expectStatus: "pass",
    input: {
      projectId: "proj_content_2",
      sourceText: "用户反馈夏季出油厉害，想要清爽控油妆前内容，最好带实测对比。",
      candidates: [
        {
          title: "夏日出油实测",
          evidenceQuotes: ["夏季出油厉害", "清爽控油妆前"],
          reviewStatus: "pending",
        },
        {
          title: "妆前对比拍法",
          evidenceQuotes: ["带实测对比"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_success_angle",
    kind: "success",
    expectStatus: "pass",
    input: {
      projectId: "proj_content_3",
      sourceText: "老板让围绕「第一次上门诊断」写转化型短视频，突出咨询师专业感。",
      candidates: [
        {
          title: "上门诊断第一课",
          angle: "专业感",
          evidenceQuotes: ["第一次上门诊断", "咨询师专业感"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_insufficient_no_quote",
    kind: "insufficient",
    expectStatus: "needs_human",
    input: {
      projectId: "proj_content_4",
      sourceText: "随便聊聊最近行业风向，没有具体产品或场景。",
      candidates: [
        {
          title: "行业风向口播",
          evidenceQuotes: [],
          insufficientInfoNotes: ["灵感原文缺少可引用产品/场景证据"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_insufficient_thin",
    kind: "insufficient",
    expectStatus: "needs_human",
    input: {
      projectId: "proj_content_5",
      sourceText: "客户说想做内容，但没说人群和卖点。",
      candidates: [
        {
          title: "待补人群卖点",
          evidenceQuotes: [],
          insufficientInfoNotes: ["缺少目标人群与卖点，信息不足"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_insufficient_partial",
    kind: "insufficient",
    expectStatus: "needs_human",
    input: {
      projectId: "proj_content_6",
      sourceText: "只提到品牌叫明远，其它细节下周再补。",
      candidates: [
        {
          title: "明远品牌故事",
          evidenceQuotes: [],
          insufficientInfoNotes: ["仅有品牌名，缺少具体故事素材"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_tool_failed_fabricated",
    kind: "tool_failed",
    expectStatus: "fail",
    input: {
      projectId: "proj_content_7",
      sourceText: "群里说下周要做敏感肌美白选题。",
      candidates: [
        {
          title: "虚构爆款",
          evidenceQuotes: ["原文根本没有的句子"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_tool_failed_no_project",
    kind: "tool_failed",
    expectStatus: "fail",
    input: {
      projectId: "",
      sourceText: "有一段足够长的灵感原文用来过长度检查。",
      candidates: [
        {
          title: "无项目选题",
          evidenceQuotes: ["足够长的灵感原文"],
          reviewStatus: "pending",
        },
      ],
    },
  },
  {
    id: "content_topic_tool_failed_empty_candidates",
    kind: "tool_failed",
    expectStatus: "fail",
    input: {
      projectId: "proj_content_9",
      sourceText: "有一段足够长的灵感原文用来过长度检查。",
      candidates: [],
    },
  },
])

/**
 * @description 跑内容选题 fixture 并核对期望状态
 */
export function runContentTopicFixtures(
  fixtures: readonly ContentTopicFixture[] = CONTENT_TOPIC_FIXTURES,
): { total: number; passed: number; failed: Array<{ id: string; expected: string; actual: string }> } {
  const failed: Array<{ id: string; expected: string; actual: string }> = []
  for (const fixture of fixtures) {
    const result = verifyContentTopic(fixture.input)
    if (result.status !== fixture.expectStatus) {
      failed.push({ id: fixture.id, expected: fixture.expectStatus, actual: result.status })
    }
  }
  return { total: fixtures.length, passed: fixtures.length - failed.length, failed }
}
