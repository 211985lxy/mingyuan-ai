/**
 * AimPromptComposer 及其子组件共享的类型。
 * 抽出独立文件是为了：
 *   - aim-prompt-composer.tsx 瘦身（通过 file 500 行护栏）
 *   - 子组件（aim-action-bar / aim-add-menu-panel）不再重复定义
 */
export type AimComposerMode = "direct" | "plan"
