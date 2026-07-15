export type AimWorkbenchCommandId =
  | "integrate_editor"
  | "fill_reference"
  | "open_editor"
  | "close_editor"
  | "save_editor"
  | "reset_conversation"
  | "regenerate"
  | "optimize_opening"
  | "revise_current_draft"
  | "rewrite_benchmark"
  | "run_quality_check"
  | "remember_preference"

export interface AimWorkbenchCommand {
  id: AimWorkbenchCommandId
  input: string
}

const MAX_COMMAND_INPUT_LENGTH = 120

const NEW_TASK_PATTERNS = [
  /(?:这是|开始|切到|换成)?(?:一个)?(?:全新|新的|新)(?:文案|任务|选题|主题)/,
  /(?:再|另|重新)(?:写|做|开)(?:一篇|一个)(?:文案|任务|选题|主题)?/,
  /(?:换一篇|换个主题|换个选题|下一个任务)/,
  /(?:不要|别)(?:再)?(?:接着|继续)(?:改|写)(?:上一|前一|第一)(?:篇|版|个)?/,
]

/** 明确开启另一篇内容时，旧对话和当前编辑稿都不应继续作为本轮上下文。 */
export function hasExplicitNewTaskIntent(text: string): boolean {
  const input = text.trim().replace(/\s+/g, "")
  return input.length > 0 && NEW_TASK_PATTERNS.some((pattern) => pattern.test(input))
}

const COMMAND_PATTERNS: Array<{ id: AimWorkbenchCommandId; pattern: RegExp }> = [
  { id: "reset_conversation", pattern: /(清空|重置|重新开始).{0,6}(对话|聊天|当前内容)/ },
  { id: "save_editor", pattern: /(保存|同步).{0,8}(编辑稿|编辑区|我的稿子|交付物)/ },
  { id: "open_editor", pattern: /(打开|展开|显示).{0,8}(编辑区|文案编辑|我的稿子)/ },
  { id: "close_editor", pattern: /(隐藏|收起|关闭).{0,8}(编辑区|文案编辑|我的稿子)/ },
  { id: "fill_reference", pattern: /对标原文.*(右侧|文案编辑|对标文案|编辑区)|(右侧|文案编辑|对标文案|编辑区).*对标原文/ },
  { id: "integrate_editor", pattern: /(整合|合并|放|搞|弄|更新|同步).{0,8}编辑区|编辑区.{0,8}(整合|合并|更新|同步)/ },
  { id: "revise_current_draft", pattern: /(融入|结合|带入|写进|放进).{0,10}(人设|IP|资料|故事|来时路)|(人设|IP|资料|故事|来时路).{0,10}(自然融入|融进去|写进去)|((别|不要|不能).{0,6}(越改越短|越写越短|缩水|压缩))|((保持|维持|别改短|不要缩短).{0,8}(原稿|原文|字数|长度|体量))/ },
  { id: "rewrite_benchmark", pattern: /(按原文字数|对标原文|不要照抄|重新洗).{0,12}(重写|改写|再生成)/ },
  { id: "optimize_opening", pattern: /(优化|改|重写|加强|调整).{0,6}(开头|开场|起手|钩子|前3秒|前三秒|第一句话)/ },
  { id: "regenerate", pattern: /(重新生成|再生成|重来一版|换一版)/ },
  { id: "run_quality_check", pattern: /(检查|自检|质检).{0,12}(照抄|字数|跑题|AI味|质量)/ },
  { id: "remember_preference", pattern: /(记住|沉淀|保存).{0,8}(偏好|规则|习惯|口吻)/ },
]

export function detectAimWorkbenchCommand(text: string): AimWorkbenchCommand | null {
  const input = text.trim()
  if (!input) return null
  if (input.length > MAX_COMMAND_INPUT_LENGTH) return null
  const command = COMMAND_PATTERNS.find((item) => item.pattern.test(input))
  return command ? { id: command.id, input } : null
}
