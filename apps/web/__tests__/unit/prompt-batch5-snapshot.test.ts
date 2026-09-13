import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { FORMAT_INSTRUCTIONS, buildXhsVisualDirectorInstruction } from "@/lib/aim-agent-prompts"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"

/**
 * 批 5 / WP-1.2 下一刀：格式指令、小红书导演、脚本 system、闭集事实、评分专家。
 * 生成：UPDATE_PROMPT_BATCH5_SNAPSHOT=1 vitest run 本文件
 */

const SNAPSHOT_PATH = resolve(__dirname, "__fixtures__/prompt-batch5-snapshot.json")

const CLOSED_SET_FACTS =
  "这是闭集事实任务：只使用用户原始输入里的事实、客户信息和数字，不调用或复述其他背景事实。客户案例段只能逐字引用用户原文里的事实锚点；禁止补充人员、流程、渠道、做法、原因、其他结果或因果解释，禁止计算、换算或概括降幅、比例等衍生数字，禁止用“他们”“该公司”“这家公司”引出任何新信息。事实锚点之前必须完整展开目标客户、用户明确写出的痛点、问题机制和不含新增事实或数字的可执行判断，篇幅必须匹配用户指定时长，不能缩成几句话。结尾只执行用户指定的行动引导，不增加免费、保证、限时或交付承诺。直接输出完整成稿，不解释、不分析、不增加案例细节。"

const SCRIPT_WITH_PROMPT_SYSTEM = [
  "你是一位顶级短视频口播文案创作者。",
  "严格按照指令创作。",
  "你不能输出错误说明、补充要求、道歉、解释或调试信息。",
  '你只能输出 JSON 对象：{"scripts":["...","...","..."]}。',
  "",
  "【反AI味硬性规则——必须遵守】",
  "1. 禁用词清单（出现任何一个都是严重扣分项）：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
  "2. 禁止排比三连（三个以上相同句式连续出现）。",
  "3. 禁止'首先...其次...最后...'这类文章式过渡。",
  "4. 禁止'不是...而是...'、'与其...不如...'这类套路句式连续出现超过一次。",
  "5. 用口语化短句，像真人在跟镜头说话，不是在写公众号文章。",
  "6. 允许适度口语词（啊、呢、吧、嘛），但不要刻意堆砌。",
  "7. 每条文案前3秒必须有具体信息或反常识表述，禁止用'今天我们来聊一个...'这类万能开场。",
].join("\n")

const SCRIPT_DIRECT_SYSTEM = [
  "你是一位顶级短视频口播文案创作者。",
  "你必须直接交付结果，不允许回复缺少信息、需要补充、无法执行、报错说明或调试文字。",
  '你只能输出 JSON 对象：{"scripts":["...","...","..."]}。',
  "",
  "【反AI味硬性规则——必须遵守】",
  "1. 禁用词：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
  "2. 禁止排比三连、文章式过渡（首先...其次...最后...）、套路句式连续重复。",
  "3. 口语化短句，像真人跟镜头说话，前3秒必须有具体信息或反常识表述。",
].join("\n")

const SCRIPT_SCORING_SYSTEM = "你是一位严格的短视频文案质量审核专家。只输出纯 JSON，不添加任何说明。"

describe("prompt-batch5 FORMAT / 脚本 system 快照", () => {
  it("与迁移前逐字节一致", async () => {
    const { generateScriptsWithPrompt, generateScriptsDirectly } = await import(
      "@/lib/script-generation/generation"
    )
    const { scoreWithAI } = await import("@/lib/script-generation/scoring")

    const systems: string[] = []
    const fakeLlm = {
      complete: async (options: { messages: Array<{ role: string; content: string }> }) => {
        const system = options.messages.find((message) => message.role === "system")
        if (system) systems.push(system.content)
        throw new Error("snapshot-stop")
      },
    }

    await generateScriptsWithPrompt(fakeLlm as never, "meta").catch(() => undefined)
    await generateScriptsDirectly(fakeLlm as never, "ctx", {
      template: { id: "t1", displayName: "口播", description: "", scriptTemplate: "", hookType: "hook" },
      inputs: {},
    } as never).catch(() => undefined)
    await scoreWithAI(fakeLlm as never, ["稿1", "稿2", "稿3"], {
      template: { id: "t1", displayName: "口播", description: "", scriptTemplate: "", hookType: "hook" },
      inputs: {},
    } as never).catch(() => undefined)
    const withPromptSystem = systems[0]
    const directSystem = systems[1]
    const scoringSystem = systems[2]

    const observed: Record<string, string> = {
      "format.video_script": FORMAT_INSTRUCTIONS.video_script,
      "format.wechat_article": FORMAT_INSTRUCTIONS.wechat_article,
      "format.moments_post": FORMAT_INSTRUCTIONS.moments_post,
      "format.community_message": FORMAT_INSTRUCTIONS.community_message,
      "format.raw_copy": FORMAT_INSTRUCTIONS.raw_copy,
      "format.shooting_brief": FORMAT_INSTRUCTIONS.shooting_brief,
      "format.koubo_script": FORMAT_INSTRUCTIONS.koubo_script,
      "format.xiaohongshu_post": FORMAT_INSTRUCTIONS.xiaohongshu_post,
      "xhs.builder": buildXhsVisualDirectorInstruction(),
      "script.withPromptSystem": withPromptSystem,
      "script.directSystem": directSystem,
      "script.scoringSystem": scoringSystem,
      closedSetFacts: CLOSED_SET_FACTS,
    }

    if (process.env.UPDATE_PROMPT_BATCH5_SNAPSHOT) {
      mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true })
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(observed, null, 2) + "\n", "utf8")
      expect(withPromptSystem).toBe(SCRIPT_WITH_PROMPT_SYSTEM)
      expect(directSystem).toBe(SCRIPT_DIRECT_SYSTEM)
      expect(scoringSystem).toBe(SCRIPT_SCORING_SYSTEM)
      return
    }

    const baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Record<string, string>
    for (const [name, value] of Object.entries(baseline)) {
      expect(observed[name], `快照案例 ${name} 缺失`).toBeDefined()
      expect(observed[name], `快照案例 ${name} 与迁移前基线不一致`).toBe(value)
    }
    expect(Object.keys(observed).sort()).toEqual(Object.keys(baseline).sort())
    expect(observed["format.koubo_script"]).toBe(observed["format.video_script"])
    expect(observed["format.xiaohongshu_post"]).toBe(observed["xhs.builder"])
    expect(observed["script.withPromptSystem"]).toBe(SCRIPT_WITH_PROMPT_SYSTEM)
    expect(observed["script.directSystem"]).toBe(SCRIPT_DIRECT_SYSTEM)
    expect(observed["script.scoringSystem"]).toBe(SCRIPT_SCORING_SYSTEM)
    expect(promptRegistry.get(PROMPT_KEYS.formatVideoScript).content).toBe(baseline["format.video_script"])
    expect(promptRegistry.get(PROMPT_KEYS.formatXiaohongshuPost).content).toBe(baseline["format.xiaohongshu_post"])
    expect(promptRegistry.get(PROMPT_KEYS.scriptGenerationWithPromptSystem).content).toBe(baseline["script.withPromptSystem"])
    expect(promptRegistry.get(PROMPT_KEYS.contentProducerClosedSetFacts).content).toBe(baseline.closedSetFacts)
  })
})
