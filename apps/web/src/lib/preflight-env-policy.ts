/**
 * preflight:env 退出策略：环境漂移必须阻断；模型探针失败只警告。
 * 第三方瞬态故障常见，不能因为探针挂了就拦本地开发。
 */
export function resolvePreflightEnvExit(input: { sanityOk: boolean; probeOk: boolean }): {
  exitCode: number
  warnProbe: boolean
} {
  if (!input.sanityOk) return { exitCode: 1, warnProbe: false }
  return { exitCode: 0, warnProbe: !input.probeOk }
}
