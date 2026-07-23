"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  CONTENT_PACKAGE_FORMATS,
  CONTENT_PACKAGE_FORMAT_LABELS,
  getContentPackageFromTaskSpec,
  type ContentPackageFormat,
} from "@/lib/content-package-spec"
import { isCanonicalConfirmed, getCanonicalFromTaskSpec } from "@/lib/canonical-content-spec"
import type { AimGenerateResponse, ContentFormat } from "@/lib/api/client"

export interface ContentPackagePanelProps {
  deliverables: AimGenerateResponse
  isBusy: boolean
  onGeneratePackage: (formats: ContentFormat[]) => void
}

/**
 * @description 内容包多选生成 / 失败重试（阶段 3）
 */
export function ContentPackagePanel({
  deliverables,
  isBusy,
  onGeneratePackage,
}: ContentPackagePanelProps) {
  const packageSpec = getContentPackageFromTaskSpec(deliverables.taskSpec)
  const canonicalOk = isCanonicalConfirmed(getCanonicalFromTaskSpec(deliverables.taskSpec))
  const existing = useMemo(
    () => new Set(deliverables.results.filter((item) => item.content.trim()).map((item) => item.format)),
    [deliverables.results],
  )

  const available = CONTENT_PACKAGE_FORMATS.filter((format) => {
    if (format === "video_script") return !existing.has("video_script") && !existing.has("koubo_script")
    return !existing.has(format)
  })

  const [selected, setSelected] = useState<ContentPackageFormat[]>(() =>
    available.slice(0, Math.min(3, available.length)),
  )
  const [open, setOpen] = useState(false)

  if (!canonicalOk) {
    return (
      <p className="mb-2 text-[11px] text-muted-foreground">
        确认母内容后，可一次选择 2—5 个平台生成内容包。
      </p>
    )
  }

  const failed = packageSpec?.failedFormats ?? []
  const completedCount = packageSpec?.completedFormats.length ?? existing.size

  function toggle(format: ContentPackageFormat) {
    setSelected((current) => {
      if (current.includes(format)) return current.filter((item) => item !== format)
      if (current.length >= 5) return current
      return [...current, format]
    })
  }

  return (
    <div className="mb-3 rounded-xl border border-border/80 bg-secondary/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">多平台内容包</p>
          <p className="text-[11px] text-muted-foreground">
            {packageSpec
              ? `已完成 ${completedCount} · 失败 ${failed.length} · 请求 ${packageSpec.requestedFormats.length}`
              : "一次选择多个平台，真实生成并保存；失败可单独重试"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={isBusy || available.length === 0}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "收起" : "拆成多平台"}
        </Button>
      </div>

      {failed.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {failed.map((item) => (
            <Button
              key={item.format}
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-primary"
              disabled={isBusy}
              onClick={() => onGeneratePackage([item.format])}
            >
              重试「{CONTENT_PACKAGE_FORMAT_LABELS[item.format as ContentPackageFormat] ?? item.format}」
            </Button>
          ))}
        </div>
      ) : null}

      {open ? (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            {available.map((format) => {
              const checked = selected.includes(format)
              return (
                <button
                  key={format}
                  type="button"
                  onClick={() => toggle(format)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {CONTENT_PACKAGE_FORMAT_LABELS[format]}
                </button>
              )
            })}
          </div>
          {available.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">可派生格式都已具备。</p>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-8 w-full text-xs"
              disabled={isBusy || selected.length === 0}
              onClick={() => onGeneratePackage(selected)}
            >
              {isBusy ? <Loader2 className="size-3.5 animate-spin" /> : null}
              一次生成 {selected.length} 个格式
            </Button>
          )}
        </div>
      ) : null}

      {packageSpec?.failedFormats.length ? (
        <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {packageSpec.failedFormats.map((item) => (
            <li key={`${item.format}-${item.reason}`}>
              {CONTENT_PACKAGE_FORMAT_LABELS[item.format as ContentPackageFormat] ?? item.format}
              ：{item.reason}
            </li>
          ))}
        </ul>
      ) : null}

      {canonicalOk && packageSpec && packageSpec.failedFormats.length === 0
        && packageSpec.requestedFormats.length >= 2
        && packageSpec.requestedFormats.every((format) => existing.has(format) || packageSpec.completedFormats.includes(format))
        ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            内容包已齐。完成后会自动进入「待审核」；登记发布仍需人工确认平台与链接。
          </p>
        ) : null}
    </div>
  )
}
