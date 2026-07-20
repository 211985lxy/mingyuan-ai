"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { useBranding } from "@/components/providers/branding-provider"
import { BrandLogo } from "@/components/branding/brand-logo"

const footerColumns = [
  {
    headingKey: "product",
    links: [
      { key: "features", href: "#features", ns: "navbar" },
      { key: "howItWorks", href: "#how-it-works", ns: "navbar" },
      { key: "useCases", href: "#use-cases", ns: "navbar" },
    ],
  },
  {
    headingKey: "getStarted",
    links: [
      { key: "login", href: "/login", ns: "navbar" },
      { key: "cta", href: "/register", ns: "navbar" },
    ],
  },
  {
    headingKey: "company",
    links: [
      { key: "contact", href: "/register", ns: "footer" },
    ],
  },
]

/**
 * @description marketingfooter
 * @returns 无返回值
 */
export function MarketingFooter() {
  const t = useTranslations("Footer")
  const tN = useTranslations("Navbar")
  const branding = useBranding()

  return (
    <footer className="border-t border-white/5 bg-[#25211D]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand column */}
          <div className="col-span-2 md:col-span-1">
            <div className="mb-3 flex items-center gap-2.5">
              <BrandLogo className="h-7 w-7" />
              <span className="text-xl font-bold text-white">{branding.name}</span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-white/55">
              {t("tagline")}
            </p>
          </div>

          {/* Link columns */}
          {footerColumns.map(({ headingKey, links }) => (
            <div key={headingKey}>
              <h3 className="mb-4 text-sm font-semibold text-white">
                {t(headingKey)}
              </h3>
              <ul className="space-y-2.5">
                {links.map(({ key, href, ns }) => {
                  const label = ns === "navbar" ? tN(key) : t(key)
                  const isRoute = href.startsWith("/")
                  return (
                    <li key={key}>
                      {isRoute ? (
                        <Link
                          href={href}
                          className="text-sm text-white/55 transition-colors duration-200 hover:text-white"
                        >
                          {label}
                        </Link>
                      ) : (
                        <a
                          href={href}
                          className="text-sm text-white/55 transition-colors duration-200 hover:text-white"
                        >
                          {label}
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 border-t border-white/5 pt-8">
          <p className="text-center text-sm text-white/35">{t("copyright")}</p>
        </div>
      </div>
    </footer>
  )
}
