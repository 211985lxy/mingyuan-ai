export const AIM_CHAT_PENDING_TEXT = "正在思考，会先读取上下文和资料，再给出回复…"
export const AIM_CHAT_STOPPED_TEXT = "已停止本次回复。"

/**
 * @description 构建aimchatfailuretext
 * @param message - 消息
 * @returns string
 */
export function buildAimChatFailureText(message: string): string {
  return `对话失败：${message}`
}

/**
 * @description 构建aimgenerationpendingtext
 * @param actionLabel - 操作标签
 * @returns string
 */
export function buildAimGenerationPendingText(actionLabel: string): string {
  return `正在${actionLabel}，会先读取项目资料、匹配知识库，再生成交付物…`
}

/**
 * @description 判断是否可以startaimgeneration
 * @param input - 输入数据
 * @returns boolean
 */
export function canStartAimGeneration(input: {
  text: string
  imageCount: number
  projectEnabled: boolean
  projectId: string
  uploadingImage: boolean
}): boolean {
  return (
    (input.text.trim().length > 0 || input.imageCount > 0)
    && (!input.projectEnabled || Boolean(input.projectId))
    && !input.uploadingImage
  )
}
