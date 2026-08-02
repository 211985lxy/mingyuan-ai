import type { AimGenerateContext } from "./aim-agent-handlers"
import type { ContentFormat } from "./aim-generator"
import { isBenchmarkCopyTooSimilar } from "./aim-benchmark-quality"

const FIRST_PERSON_EVIDENCE_PATTERN = /(?:我有个|我身边有个|我的)(?:学员|客户|朋友|同事|下属)|我给你讲(?:个|一个|件|一件)真事|我们(?:公司|团队)(?:(?:去年|前阵子|之前)\s*)?(?:来|招|遇到|有)(?:了)?(?:个|一个|一位)|我(?:(?:曾经|以前|之前|亲自|亲眼)\s*)?(?:带过|帮过|服务过|辅导过|遇到过|见过|做过|认识)(?:一个|一位|不少|很多|太多|客户|企业|老板|团队|新人)|我(?:观察|接触|辅导|服务|带)(?:了)?(?:太多|很多|不少)(?:学员|客户|(?:职场)?新人|老板|企业|团队)|(?:来找我|找到我|咨询我)(?:的)?(?:客户|老板|企业|小企业老板)/
const UNSUPPORTED_ANECDOTE_PATTERN = /我(?:上周|上个月|去年|前阵子|最近)[，,\s]*(?:帮|帮助|服务|辅导|带|见过|遇到|认识|接触|观察)(?:了|过)?|我[，,\s]*(?:帮|帮助|服务|辅导|带|见过|遇到|认识|接触|观察)(?:了|过)?(?:一家|一个|一位|有人|不少|很多|客户|公司|企业|老板|朋友|学员)|(?:上周|上个月|去年|前阵子|最近).{0,16}(?:客户|公司|企业|老板|朋友|学员)|(?:有|遇到|来了)(?:个|一个|一位|一家).{0,12}(?:客户|公司|企业|老板|朋友|学员)|(?:一个|一位|一家).{0,12}(?:客户|公司|企业|老板|朋友|学员).{0,24}(?:做了|发了|赚了|成交|询盘|增长|提升|降低|节省)/
const HYPOTHETICAL_MARKER_PATTERN = /假设|比如|例如|举例|如果|设想|虚构示例/
const STRICT_NUMERIC_CLAIM_PATTERN = /不得(?:新增|编造|出现)(?:任何)?其他数字|禁止(?:新增|编造)(?:任何)?数字/
// 只把可核验的经营结果视为硬事实；时长、步骤数、内容条数等创意表达不在这里拦截。
const NUMERIC_CLAIM_PATTERN = /(?:\d+(?:\.\d+)?|[零〇一二两三四五六七八九十百千万亿]+)\s*(?:%|％|个人|位|家|人|元|块|万元|亿元|倍|成|折)/gu
const BENIGN_SINGULAR_PHRASES = new Set(["一个", "一条", "一个人", "一家", "一人", "一位", "一步", "一套", "一次"])
const APPROVED_FACTS_MARKER = "[[APPROVED_FACTS]]"
const APPROVED_FACTS_PATTERN = /必须准确引用(?:两个|[一二两三四五六七八九十]+个)?事实[:：]\s*([\s\S]*?)(?=。?(?:目标客户是|痛点是|结尾只|禁止|不得)|$)/u
const APPROVED_CTA_PATTERN = /结尾只引导\s*([^。]+)(?=。|$)/u

function extractNumericClaims(text: string): Set<string> {
  return new Set(Array.from(text.matchAll(NUMERIC_CLAIM_PATTERN), (match) =>
    match[0].replace(/\s/g, "").replace(/块$/, "元").replace(/个$/, "条")))
}

export function hasStrictNumericClaimConstraint(rawInput: string): boolean {
  return STRICT_NUMERIC_CLAIM_PATTERN.test(rawInput)
}

export function buildClosedWorldModelInput(rawInput: string): string {
  if (!hasStrictNumericClaimConstraint(rawInput)) return rawInput
  const match = rawInput.match(APPROVED_FACTS_PATTERN)
  if (!match?.[1]?.trim()) return rawInput
  return rawInput.replace(match[0], `客户案例段必须单独输出 ${APPROVED_FACTS_MARKER}`)
}

export function materializeApprovedFacts(content: string, rawInput: string): string {
  const facts = rawInput.match(APPROVED_FACTS_PATTERN)?.[1]?.trim()
  if (!facts) return content
  const contentWithMarker = content.includes(APPROVED_FACTS_MARKER)
    ? content
    : `${content.trim()}\n\n${APPROVED_FACTS_MARKER}`
  const approvedNumbers = new Set(facts.match(/\d+(?:\.\d+)?/g) ?? [])
  const approvedCta = rawInput.match(APPROVED_CTA_PATTERN)?.[1]?.trim()
  const customerElaboration = /(?:他们|该公司|这家公司|这个案例|案例中|与我们|在我们|我们(?:服务|帮助|支持)|我们的服务|量身定制|高质量内容|优质内容|主持人姓名|主播自我介绍|XXX)/
  const unsupportedServiceClaim = /(?:我们|已经)?帮(?:过)?(?:不少|很多|一些|多家)?企业|解决过类似(?:的)?难题|我们(?:服务|帮助|支持)过/
  let foundFactsMarker = false
  const paragraphs = contentWithMarker.split(/\n{2,}/).flatMap((paragraph) => {
    if (paragraph.includes(APPROVED_FACTS_MARKER)) {
      foundFactsMarker = true
      return [APPROVED_FACTS_MARKER]
    }
    if (foundFactsMarker && approvedCta) return []
    const scrubbed = paragraph
      .split(/(?<=[。！？!?])/u)
      .filter((sentence) => !unsupportedServiceClaim.test(sentence))
      .join("")
      .trim()
    const repeatsApprovedNumber = (scrubbed.match(/\d+(?:\.\d+)?/g) ?? [])
      .some((value) => approvedNumbers.has(value))
    if (!scrubbed || repeatsApprovedNumber || customerElaboration.test(scrubbed)) return []
    return [scrubbed]
  })
  const body = paragraphs.join("\n\n").replace(APPROVED_FACTS_MARKER, facts)
  return approvedCta ? `${body}\n\n${approvedCta}。` : body
}

export function buildGroundedNumericClaimRule(rawInput: string): string {
  if (!hasStrictNumericClaimConstraint(rawInput)) return ""
  if (APPROVED_FACTS_PATTERN.test(rawInput)) {
    return `\n\n【事实锚点门禁】客户案例段必须且只能单独输出 ${APPROVED_FACTS_MARKER}，不得在标记前后复述、改写、解释或推断案例信息。其他段落不得新增数字。`
  }
  const allowed = [...extractNumericClaims(rawInput)]
  return `\n\n【数字事实门禁】正文只能使用用户原文已有的数字表达：${allowed.join("、") || "无"}。如输入包含 ${APPROVED_FACTS_MARKER}，必须原样保留该标记且不得在其他位置提及或解释客户案例。不得新增人数、时长、步骤数、比例或结果数字；缺少依据时删掉数字，不得猜测。`
}

export function findUnsupportedNumericClaimFormats(
  context: Pick<AimGenerateContext, "rawInput">,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
): ContentFormat[] {
  if (!hasStrictNumericClaimConstraint(context.rawInput)) return []
  const allowed = extractNumericClaims(context.rawInput)
  return targetFormats.filter((format) => {
    const unsupported = [...extractNumericClaims(parsed[format] || "")]
      .filter((claim) => !allowed.has(claim) && !BENIGN_SINGULAR_PHRASES.has(claim))
    if (unsupported.length) {
      console.warn("[aim-generation] blocked unsupported numeric claims", { format, unsupported })
    }
    return unsupported.length > 0
  })
}

function containsUnsupportedAnecdote(text: string): boolean {
  return text
    .split(/(?<=[。！？!?；;\n])/)
    .some((sentence) =>
      !HYPOTHETICAL_MARKER_PATTERN.test(sentence)
      && (
        FIRST_PERSON_EVIDENCE_PATTERN.test(sentence)
        || UNSUPPORTED_ANECDOTE_PATTERN.test(sentence)
      ))
}

export function findUnsupportedFirstPersonClaimFormats(
  context: AimGenerateContext,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
): ContentFormat[] {
  const evidence = [
    context.rawInput,
    context.knowledgeBlock,
    context.ipWikiBlock,
    context.eventStorytellingBlock,
  ].filter(Boolean).join("\n")
  if (containsUnsupportedAnecdote(evidence)) return []

  return targetFormats.filter((format) =>
    containsUnsupportedAnecdote(parsed[format] || ""))
}

export function isGenericContentRequestWithoutFacts(
  context: Pick<
    AimGenerateContext,
    | "rawInput"
    | "knowledgeBlock"
    | "ipWikiBlock"
    | "topicTitle"
    | "topicRationale"
    | "hotTopic"
    | "taskSpec"
  >,
): boolean {
  const hasContext = Boolean(
    context.knowledgeBlock?.trim()
    || context.ipWikiBlock?.trim()
    || context.topicTitle?.trim()
    || context.topicRationale?.trim()
    || context.hotTopic?.trim()
    || context.taskSpec?.knownFacts?.length,
  )
  if (hasContext) return false
  const normalized = context.rawInput
    .trim()
    .replace(/[，。！？!?,.\s]/g, "")
  return /^(?:请|帮我|给我|麻烦)?(?:写|生成|出)(?:一版|一条|一个|一篇|个)?(?:短视频|视频|口播)?(?:脚本|文案|内容)$/.test(
    normalized,
  )
}

/** 从 rawInput 解析内容目的锚点（由 aim-agent-skills.ts 的技能 prompt 注入）。 */
export type ContentPurpose = "traffic" | "lead" | "story" | "unknown"

function resolveContentPurpose(rawInput: string): ContentPurpose {
  if (/【内容目的锚点】\s*=\s*流量漏斗/.test(rawInput)) return "traffic"
  if (/【内容目的锚点】\s*=\s*线索获客/.test(rawInput)) return "lead"
  if (/【内容目的锚点】\s*=\s*通用故事/.test(rawInput)) return "story"
  return "unknown"
}

export function findLightEditScopeViolationFormats(
  context: Pick<
    AimGenerateContext,
    "rawInput" | "polishInstruction" | "runtimeTask"
  >,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
): ContentFormat[] {
  if (context.runtimeTask !== "light_edit") return []
  const instruction = `${context.rawInput}\n${context.polishInstruction || ""}`
  if (
    /精简|缩短|压缩|一句话|标题|开头|第一句|前三秒|前3秒|钩子|结尾|收尾|CTA/.test(
      instruction,
    )
  ) return []
  if (!/润色|文字二改|去\s*AI\s*味|这段|这篇|这段话/.test(instruction)) {
    return []
  }
  const sourceText = context.rawInput.replace(/^【成稿】/, "").trim()
  if (sourceText.length < 12) return []
  const minimumLength = Math.floor(sourceText.length * 0.72)

  // 内容目的决定结构检测策略：
  // - 流量型：结构灵活，只检测长度缩短，不锁死结构模块
  // - 线索型：结构要求高，检测全部6类结构模块
  // - 通用故事型：检测叙事结构模块（痛点、CTA、谁适合）
  // - 未知：默认不检测结构模块（宽松策略，避免误报）
  const purpose = resolveContentPurpose(context.rawInput)

  return targetFormats.filter((format) => {
    const output = (parsed[format] || "").trim()
    if (output.length < minimumLength) return true
    if (purpose === "traffic" || purpose === "unknown") return false
    const droppedModules = findDroppedStructureModules(sourceText, output, purpose)
    return droppedModules.length > 0
  })
}

/**
 * 轻改结构骨架检测：识别原文中已有的关键结构模块，检查输出是否把它们删掉了。
 * 返回被删掉的模块名列表（空数组=没删）。
 *
 * 检测范围按内容目的区分：
 * - lead（线索获客）：检测全部6类（钩子、可收藏抓手、句锚、CTA、谁适合/不适合、痛点场景）
 * - story（通用故事）：检测叙事相关3类（句锚、CTA、痛点场景）
 * - traffic / unknown：不调用此函数（上游已跳过）
 */
export function findDroppedStructureModules(
  source: string,
  output: string,
  purpose: ContentPurpose = "lead",
): string[] {
  const dropped: string[] = []
  const src = source.toLowerCase()
  const out = output.toLowerCase()

  // 线索获客按 Obsidian《02-线索获客打法》真实结构严格检测；
  // 通用故事只检测后3类（句锚/CTA/痛点场景）。
  const checkAll = purpose === "lead"

  if (checkAll) {
    // 1. 精准客户三特征落地（至少照出1条：已投入筹码/已感到代价/决策压力）
    const precisionCustomerMarkers = /(?:已经|之前|此前|去年|前阵子|上周|上个月).{0,20}(?:投入|花|砸|烧|耗|招|换|试过|走过)|花了.{0,8}(?:万|块|费用|预算|冤枉|白花)|已经发过.{0,12}条|已经做了.{0,12}年|团队.{0,8}换过|窗口.{0,8}关闭|机会.{0,8}不等人|决策.{0,8}压力|必须.{0,8}做决定|判断不了|卡在|不知道该不该|不知道怎么选/
    if (precisionCustomerMarkers.test(src) && !precisionCustomerMarkers.test(out)) {
      dropped.push("精准客户三特征落地")
    }

    // 2. 问题（刚需痛点，不是泛泛痛点）
    const realPainMarkers = /(?:愿意付钱|花过钱|花了钱|投入过|付出过|代价|损失|亏了|白花|浪费|错过|拖下去|继续这样|再不解决|再拖|卡住|卡在|瓶颈|上不去|下不来)/
    if (realPainMarkers.test(src) && !realPainMarkers.test(out)) {
      dropped.push("问题-刚需痛点")
    }

    // 3. 解法三段：错在哪→为什么→怎么做
    const diagnoseMarkers = /(?:错在|误区|误判|搞错|做错|做反|反了|错杀|漏掉|踩坑|为什么|因为|根源|本质是|底层是|其实是|真相是|怎么做|怎么改|改成|换成|正确做法|对的|应该)/
    if (diagnoseMarkers.test(src) && !diagnoseMarkers.test(out)) {
      dropped.push("解法-错在哪/为什么/怎么做")
    }

    // 4. 方案（小切口，4条件：立刻能用/零门槛/有反馈/只解决局部）
    const smallSolutionMarkers = /(?:小切口|小方法|小动作|小步骤|一个方法|一个动作|一句话|一个清单|一个标准|一个公式|一个表格|自检|自查|试试|马上能|立刻能|现在就能|零门槛|不用花钱|不用工具|只解决|不替代|不能替代|剩下|其他)/
    if (smallSolutionMarkers.test(src) && !smallSolutionMarkers.test(out)) {
      dropped.push("方案-小切口")
    }

    // 5. 谁适合/谁不适合（线索获客筛人段）
    const filterMarkers = /(?:适合|不适合|如果你是|你不是|给.*看的|给.*说的|这类人|这种人|这批人|不建议|不服务|不接|不做|甩手|只想.*的人)/
    if (filterMarkers.test(src) && !filterMarkers.test(out)) {
      dropped.push("谁适合/谁不适合")
    }
  }

  // 以下3类所有目的都检测（线索+故事）

  // 3. 句锚/结尾金句：原文结尾有金句或行动提示，输出必须有
  const srcTail = src.slice(-200)
  const outTail = out.slice(-200)
  const anchorMarkers = /(?:下次你|以后你|遇到.*就用|记住|这一句|这句话|送给你|留给你|这就是|最后说一句|说到底|归根结底|记住一句话)/
  if (anchorMarkers.test(srcTail) && !anchorMarkers.test(outTail)) {
    dropped.push("句锚")
  }

  // 4. CTA / 行动引导
  const ctaMarkers = /(?:评论|私信|预约|关注|转发|领|领取|资料|报告|咨询|报名|扣|打在评论区|留言|后台|私信我|加我)/
  if (ctaMarkers.test(src) && !ctaMarkers.test(out)) {
    dropped.push("CTA")
  }

  // 6. 痛点场景
  const painMarkers = /(?:痛点|麻烦|问题|困扰|纠结|踩坑|吃亏|亏了|花了冤枉|白花|浪费|代价|后果|坑|陷阱|误区|盲区)/
  if (painMarkers.test(src) && !painMarkers.test(out)) {
    dropped.push("痛点场景")
  }

  return dropped
}

export function inspectGenerationSafety(
  context: AimGenerateContext,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
) {
  const copiedFormats = context.runtimeTask === "light_edit"
    ? []
    : targetFormats.filter((format) =>
        isBenchmarkCopyTooSimilar(context.rawInput, parsed[format] || "")
      )
  return {
    copiedFormats,
    unsupportedNumericClaimFormats: findUnsupportedNumericClaimFormats(
      context,
      parsed,
      targetFormats,
    ),
    unsupportedClaimFormats: findUnsupportedFirstPersonClaimFormats(
      context,
      parsed,
      targetFormats,
    ),
    lightEditScopeViolationFormats: findLightEditScopeViolationFormats(
      context,
      parsed,
      targetFormats,
    ),
  }
}

export function buildGenerationSafetyRetryPrompt(
  userPrompt: string,
  parsed: Partial<Record<ContentFormat, string>>,
  targetFormats: ContentFormat[],
  findings: ReturnType<typeof inspectGenerationSafety>,
  context?: Pick<AimGenerateContext, "rawInput" | "polishInstruction" | "runtimeTask">,
): string {
  const previousOutput = targetFormats
    .map((format) => `===FORMAT:${format}===\n${parsed[format] || ""}`)
    .join("\n\n")
  const retryReasons = [
    findings.copiedFormats.length
      ? `上一版 ${findings.copiedFormats.join("、")} 与对标原文过于相似，判定为"几乎没改"。`
      : "",
    findings.unsupportedClaimFormats.length
      ? `上一版 ${findings.unsupportedClaimFormats.join("、")} 出现了上下文无依据的第一人称经历，判定为事实风险。`
      : "",
    findings.unsupportedNumericClaimFormats.length
      ? `上一版 ${findings.unsupportedNumericClaimFormats.join("、")} 出现了用户原文没有的数字表达，判定为事实风险。`
      : "",
    findings.lightEditScopeViolationFormats.length
      ? (() => {
          const sourceText = context?.rawInput?.replace(/^【成稿】/, "").trim() ?? ""
          const droppedByFormat = findings.lightEditScopeViolationFormats.map((format) => {
            const output = (parsed[format] || "").trim()
            const dropped = sourceText ? findDroppedStructureModules(sourceText, output) : []
            const lengthIssue = output.length < Math.floor(sourceText.length * 0.72)
            const parts: string[] = []
            if (lengthIssue) parts.push("明显缩短篇幅")
            if (dropped.length > 0) parts.push(`删掉了关键结构模块：${dropped.join("、")}`)
            return `${format}（${parts.join("；")}）`
          })
          return `上一版 ${droppedByFormat.join("、")} 在整段润色时破坏了原稿结构。`
        })()
      : "",
  ].filter(Boolean).join("\n")

  const structureRestoreHint = findings.lightEditScopeViolationFormats.length > 0
    ? "\n结构骨架保护：必须恢复原文已有的关键结构模块（钩子、可收藏抓手/清单/步骤、句锚/结尾金句、CTA/行动引导、谁适合/谁不适合、痛点场景）；只改写模块内的文字表达，不允许砍掉模块本身或换成另一种内容目的的写法。"
    : ""

  return `${userPrompt}

【自动质检结果】
${retryReasons}
请重写全部请求格式：保留原选题、原稿全部信息点、结构节奏和目标字数；整段润色必须保持相近篇幅。禁止声称"真事"、"我们公司的人"或"我观察/带过很多人"。无依据的人物案例改为普遍现象、可验证方法或明确写出"假设"的举例。
除专有名词和固定产品名外，不要连续沿用原文 12 个字以上；不要只替换少量词。${structureRestoreHint}

上一版输出：
${previousOutput}`
}
