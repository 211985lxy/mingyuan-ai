// stub：video-text-providers 模块待合入，临时占位避免构建失败
export type VideoTextProvider = {
  name: string
  extractText: (videoUrl: string) => Promise<string>
}

export function getVideoTextProvider(_name?: string): VideoTextProvider {
  return {
    name: "stub",
    extractText: async () => {
      throw new Error("video-text-providers 模块尚未合入")
    },
  }
}
/**
 * 视频文案提取 Provider 注册表（stub — 完整实现待合入）。
 *
 * 当前仅提供占位导出，使 video-processor.ts 可正常编译。
 */

export interface VideoTextProvider {
  name: string
  extract(url: string): Promise<{ text: string; title?: string }>
}

const stubProvider: VideoTextProvider = {
  name: "stub",
  async extract() {
    throw new Error("video-text-providers 模块尚未完整合入，暂不可用")
  },
}

export function getVideoTextProvider(_platform: string): VideoTextProvider {
  return stubProvider
}
