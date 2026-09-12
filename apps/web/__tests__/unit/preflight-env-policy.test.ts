import { describe, expect, it } from "vitest"
import { resolvePreflightEnvExit } from "@/lib/preflight-env-policy"

describe("preflight:env 退出策略", () => {
  it("sanity 失败时阻断（退出码非 0）", () => {
    expect(resolvePreflightEnvExit({ sanityOk: false, probeOk: true })).toEqual({
      exitCode: 1,
      warnProbe: false,
    })
  })

  it("探针失败不阻断，只黄字警告", () => {
    expect(resolvePreflightEnvExit({ sanityOk: true, probeOk: false })).toEqual({
      exitCode: 0,
      warnProbe: true,
    })
  })

  it("两项都过则安静通过", () => {
    expect(resolvePreflightEnvExit({ sanityOk: true, probeOk: true })).toEqual({
      exitCode: 0,
      warnProbe: false,
    })
  })
})
