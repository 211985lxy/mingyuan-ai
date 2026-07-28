"use client"

/**
 * Shared editorial section header — yibi-style label + large title, brand colors.
 */
export function MarketingSectionHeader({
  label,
  title,
  description,
  align = "left",
  tone = "light",
}: {
  label?: string
  title: string
  description?: string
  align?: "left" | "center"
  tone?: "light" | "dark"
}) {
  const alignClass = align === "center" ? "text-center mx-auto" : "text-left"
  const titleClass = tone === "dark" ? "text-white" : "text-[#25211D]"
  const descriptionClass = tone === "dark" ? "text-white/60" : "text-[#5F5A52]"
  return (
    <div className={`mb-10 max-w-3xl sm:mb-14 ${alignClass}`}>
      {label ? (
        <p className="marketing-section-label mb-3">{label}</p>
      ) : null}
      <h2 className={`marketing-h-section ${titleClass}`}>{title}</h2>
      {description ? (
        <p className={`mt-4 text-base leading-8 sm:text-lg ${descriptionClass}`}>
          {description}
        </p>
      ) : null}
    </div>
  )
}
