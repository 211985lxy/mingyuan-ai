import type { AimGenerateContext } from "./aim-agent-handlers"

const METHOD_NOTE_BLOCK_PATTERN = /\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/u

export function withoutMethodNote(content: string): string {
  return content.replace(METHOD_NOTE_BLOCK_PATTERN, "").trim()
}

export function deliveryBody(content: string): string {
  return scrubPromptLeakageFromBody(
    withoutMethodNote(content)
      .replace(/===FORMAT(?::[^=\n]+)?===/gu, "")
      .trim(),
  )
}

// ─── 提词泄漏防御性清洗 ───────────────────────────────────────────────
//
// 背景：LLM 在改写/重试/局部修改时会把系统提词、禁用词清单、改写说明等
// 内部规则文本整段回显进 FORMAT 正文块，造成成稿夹带方法论说明书腔。
//
// 设计原则（极度保守，绝不碰成稿正文）：
// 1. 只删「整行」：按 \n 分行后逐行判定；不做行内切片；
// 2. 特征必须是「不可能出现在真实用户可见文案」里的内部专属文本；
// 3. 幂等：对干净文本零影响。
// ────────────────────────────────────────────────────────────────────

/** 内部禁用词清单（按真实提词中完整或部分出现 ≥2 个即可判定为禁用词行 */
const BUZZWORD_BLOCK_TOKENS = [
  "赋能", "闭环", "抓手", "颗粒度", "对齐", "拉通", "打通", "沉淀", "复盘", "迭代",
  "链路", "触达", "心智", "赛道", "底层逻辑", "矩阵", "打法",
]

function countBuzzwordBlockHits(line: string): number {
  let n = 0
  for (const w of BUZZWORD_BLOCK_TOKENS) if (line.includes(w)) n++
  return n
}

/** 整行级提词泄漏匹配。命中返回 true（该行删掉）。 */
function isPromptLeakageLine(rawLine: string): boolean {
  const line = rawLine.trim()
  if (!line) return false

  // 1. 直接命中 AIM_METHOD_NOTE / FORMAT 内部元指令行（不可能出现在用户文稿）
  if (/AIM_METHOD_NOTE/.test(line)) return true
  if (/(?:^|[^a-zA-Z])FORMAT(?:[^a-zA-Z]|$)/.test(line) && (
    /FORMAT内|写进FORMAT|FORMAT标签|分隔标记|把方法论说明书腔写进FORMAT/.test(line)
  )) return true
  if (/在这里输出[^的，。]{0,20}的内容/.test(line)) return true

  // 2. 禁用词清单行
  if (/(注意避免禁用词|禁止使用以下词汇|禁用词[（(].*严重扣分项|逐段扫描[，,]\s*删除或替换以下禁用词)[:：]?/.test(line)) {
    if (countBuzzwordBlockHits(line) >= 3) return true
  }
  // 一行内 ≥5 个禁用词 + 禁用词引导词 = 典型禁用词表
  if (countBuzzwordBlockHits(line) >= 5 && /(禁用|禁止使用|词汇|扣分项)/.test(line)) {
    return true
  }

  // 3. 方法论库名 + 指令句式（绝对无歧义的规则提示行）
  if (/(爆款开头库|爆款文案结构库|结尾类型库)/.test(line) &&
      /(必须使用|参考下方|下方[「【]|的一种公式|中的一种)/.test(line)) {
    return true
  }
  // 原生指令句：这些字符串本身是提词写死的，永远不会被用户主动写到真实成稿里
  if (/(开头3秒必须|开头3秒必需|前15秒内先给出|核心判断放第一句|主冲突\/核心判断必须在前)/.test(line)) {
    return true
  }
  if (/(禁用开场[:：]|必含要素[:：]|平台语气[:：]|要求[:：]?只输出纯口播文案正文)/.test(line)) {
    // 只在同时匹配到规则性关键词组触发（避免真实文案里的小节）
    if (/(今天给大家分享|很多人不知道|在这个时代|具体冲突|可对号入座|像真人面对镜头)/.test(line)) return true
  }

  // 4. 改写操作内部语言（接驳点/保证接驳/替换位置/自然流畅改写配方
  if (/接驳点|保证接驳|替换位置|写进FORMAT内/.test(line)) return true
  if (/用户把[^。！？!?]{0,50}替换成[^。！？!?]{0,50}自然流畅/.test(line)) return true
  // "为保持接驳，需要在钩子末尾给一个过渡句" 类改写配方
  if (/为保持接驳|直接结束在可接驳处/.test(line)) return true
  // "原文正文第一句是...所以新钩子应以...为接驳点" 配方型语句
  if (/原文正文第一句是.*所以新钩子应以.*接驳点/.test(line)) return true
  // "核心判断放第一句。比如：" 原生规则复述
  if (/核心判断放第一句[。，,]\s*比如[:：]?/.test(line)) return true
  // "然后再接回原文…"规则复述
  if (/然后再接回原文|接回原文["""]/.test(line)) return true

  // 5. 剂量型改写指令行头（「主推开头（约150-200字…够撑30-40秒…：」
  //    行首出现 主推开头/备选开头 + 字数/时长括号 = 提词配方标签
  if (/^(主推开头|备选开头)\s*[（(]/.test(line)) return true
  if (/^(主推开头|备选开头)\s*[:：]/.test(line) && (
    /约\d+\s*[-—~到]\s*\d+\s*字|够撑\d+\s*[-—~到]\s*\d+\s*秒/.test(line)
  )) return true
  // "钩子（约X-Y字"类配方标签
  if (/^钩子\s*[（(]约\d+\s*[-—~到]\s*\d+\s*字/.test(line)) return true

  // 6. 结构模块指令头（【xx】要求：行）
  if (/^【(口播文案|公众号文章|朋友圈文案|社群运营文案|原始文案|小红书图文|拍摄交接单)】\s*要求[:：]/.test(line)) {
    return /(禁用词|禁止|开头3秒|节奏打磨|文盲式修改|至少2000字|50-200字|80-220字)/.test(line)
  }

  // 7. 节奏/文盲式规则行头
  if (/^(?:-?\s*)?(节奏打磨|文盲式修改)[:：]/.test(line)) {
    return true
  }

  // 8. "禁用以下词汇：赋能..." 类开头整行
  if (/^(?:-?\s*)?(禁止使用|禁用|避免使用)[以下的]{0,3}词汇?[:：]/.test(line) && countBuzzwordBlockHits(line) >= 3) {
    return true
  }

  return false
}

/**
 * 对交付正文做防御性的整行级提词泄漏清洗。
 * 对干净文本幂等（不改动。
 */
export function scrubPromptLeakageFromBody(body: string): string {
  if (!body) return body
  // 统一换行
  const norm = body.replace(/\r\n/g, "\n")
  const lines = norm.split("\n")
  const kept: string[] = []
  for (const ln of lines) {
    if (!isPromptLeakageLine(ln)) {
      kept.push(ln)
    }
  }
  // 收敛因删行造成空行串
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function scrubLeakedLightEditFeedback(content: string, rawInput: string): string {
  if (!/原稿[:：]/u.test(rawInput)) return content
  const feedback = rawInput.match(
    /(?:但|不过)?(?:这段|这句|这个开头|这篇)(?:话|文案|表达)?(?:太空|太泛|太弱|太平|不好|不够[^。！？!?]{0,12})[。！？!?]?/gu,
  ) ?? []
  if (!feedback.length) return content
  const methodNote = content.match(METHOD_NOTE_BLOCK_PATTERN)?.[0]
  let body = withoutMethodNote(content)
  for (const phrase of feedback) body = body.replaceAll(phrase, "")
  body = body.replace(/[，,]\s*[。！？!?]/gu, "。").replace(/[，,]\s*$/u, "。").trim()
  return [methodNote, body].filter(Boolean).join("\n\n")
}

export function buildGenerationNumericEvidence(context: Pick<
  AimGenerateContext,
  "rawInput" | "knowledgeBlock" | "ipWikiBlock" | "eventStorytellingBlock" | "taskSpec"
>): string {
  return [context.rawInput, context.knowledgeBlock, context.ipWikiBlock,
    context.eventStorytellingBlock,
    ...(context.taskSpec?.knownFacts?.map((fact) => fact.statement) ?? []),
  ].filter(Boolean).join("\n")
}
