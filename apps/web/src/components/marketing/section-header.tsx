"use client"

/**
 * Shared editorial section header — yibi-style label + large title, brand colors.
 */
export function MarketingSectionHeader({
  label,
  title,
  description,
  align = "left",
}: {
  label?: string
  title: string
  description?: string
  align?: "left" | "center"
}) {
  const alignClass = align === "center" ? "text-center mx-auto" : "text-left"
  return (
    <div className={`mb-10 max-w-3xl sm:mb-14 ${alignClass}`}>
      {label ? (
        <p className="marketing-section-label mb-3">{label}</p>
      ) : null}
      <h2 className="marketing-h-section text-[#25211D]">{title}</h2>
      {description ? (
        <p className="mt-4 text-base leading-8 text-[#5F5A52] sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  )
}
