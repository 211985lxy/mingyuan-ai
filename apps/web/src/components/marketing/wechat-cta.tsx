"use client"

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import Image from "next/image"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  MARKETING_PRIMARY_CTA,
  MARKETING_WECHAT_DISPLAY_NAME,
  MARKETING_WECHAT_NOTE,
  MARKETING_WECHAT_QR_PATH,
} from "@/lib/marketing-brand"

type MarketingCtaContextValue = {
  openWechat: () => void
}

const MarketingCtaContext = createContext<MarketingCtaContextValue | null>(null)

/**
 * @description Shared WeChat CTA opener for marketing chrome and page sections.
 */
export function MarketingCtaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openWechat = useCallback(() => setOpen(true), [])
  const value = useMemo(() => ({ openWechat }), [openWechat])

  return (
    <MarketingCtaContext.Provider value={value}>
      {children}
      <WechatQrDialog open={open} onOpenChange={setOpen} />
    </MarketingCtaContext.Provider>
  )
}

/**
 * @description Opens the shared WeChat QR dialog from any marketing CTA.
 */
export function useMarketingCta() {
  const ctx = useContext(MarketingCtaContext)
  if (!ctx) {
    throw new Error("useMarketingCta must be used within MarketingCtaProvider")
  }
  return ctx
}

/**
 * @description Primary CTA button that opens the WeChat QR dialog.
 */
export function WechatCtaButton({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  const { openWechat } = useMarketingCta()
  return (
    <button type="button" onClick={openWechat} className={className}>
      {children ?? MARKETING_PRIMARY_CTA}
    </button>
  )
}

function WechatQrDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-[#E8DED1] bg-[#FAF8F3] p-6 sm:max-w-md">
        <DialogHeader className="text-left sm:text-center">
          <DialogTitle className="text-[#25211D]">
            添加{MARKETING_WECHAT_DISPLAY_NAME}微信，预约企业 AI 业务诊断
          </DialogTitle>
          <DialogDescription className="text-[#6F675E]">
            扫码添加后，请备注「企业诊断」，我们会安排一对一沟通。
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-xl border border-[#E8DED1] bg-white p-3 shadow-sm">
          <Image
            src={MARKETING_WECHAT_QR_PATH}
            alt={`${MARKETING_WECHAT_DISPLAY_NAME}微信二维码`}
            width={803}
            height={1024}
            className="h-auto w-full"
            priority
          />
        </div>

        <p className="text-center text-sm font-medium text-[#D14A33]">
          {MARKETING_WECHAT_NOTE}
        </p>
        <p className="text-center text-xs leading-relaxed text-[#8A8175]">
          手机端可长按或截图保存二维码，再打开微信扫一扫添加。本站不会直接唤起微信。
        </p>
      </DialogContent>
    </Dialog>
  )
}
