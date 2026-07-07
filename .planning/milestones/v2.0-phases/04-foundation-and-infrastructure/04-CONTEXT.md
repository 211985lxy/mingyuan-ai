# Phase 4: Foundation and Infrastructure - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

The marketing route group exists with working bilingual locale switching, CJK font rendering, CSS isolation from the dashboard, and correct SEO metadata — the complete technical foundation before any section content is written.

Requirements: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05

</domain>

<decisions>
## Implementation Decisions

### Translation File Structure
- Flat per-section namespace: `"Hero.title"`, `"PainPoints.heading"`, `"HowItWorks.step1"` — simple, grepable, no nesting
- Translation files at `apps/web/messages/zh.json` and `apps/web/messages/en.json` — next-intl convention
- Default locale detection via `NEXT_LOCALE` cookie, fallback to `zh-CN` (Chinese primary audience)

### Marketing Navbar
- Sticky top navbar with subtle backdrop blur on scroll — stays accessible throughout page
- Mobile navigation via hamburger menu with shadcn Sheet slide-in panel
- Language switcher placed right side of navbar, before the CTA button (standard SaaS pattern)

### SEO & OG
- Title format: `ClipFlow - AI 营销短视频流水线` (zh) / `ClipFlow - AI Video Marketing Pipeline` (en) — locale-aware
- Single branded OG image (1200x630) with bilingual text — static asset in public/
- hreflang via `generateMetadata()` in marketing layout with `alternates.languages` — Next.js native

### Pre-Decided (from Research)
- i18n library: `next-intl@^4.8.3` with cookie-based locale (`localePrefix: 'never'`)
- Font: Noto Sans SC via `next/font/google` with `preload: false` and `display: swap`
- CSS isolation: `.marketing-page` wrapper class in marketing layout
- Route: `(marketing)` route group with nested layout (NOT a second root layout — no `<html>`/`<body>`)
- Components: Default Server Components; `"use client"` only for language switcher and interactive elements
- `next.config.ts`: Wrap with `createNextIntlPlugin()`

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/src/components/ui/` — 17 shadcn/ui components (button, card, badge, sheet, etc.)
- `apps/web/src/lib/branding.ts` — BrandingProvider with name/logo from DB
- `apps/web/src/app/layout.tsx` — Root layout with Plus Jakarta Sans font, BrandingProvider, TooltipProvider

### Established Patterns
- Font loaded via `next/font/google` in root layout
- CSS variables in oklch color space in `globals.css`
- shadcn/ui theming via CSS custom properties

### Integration Points
- `next.config.ts` — needs `createNextIntlPlugin()` wrapper (additive, no breaking change)
- `app/layout.tsx` — needs `NextIntlClientProvider` wrapper (additive)
- New `(marketing)/layout.tsx` — nested layout, no `<html>`/`<body>`
- New `(marketing)/page.tsx` — landing page entry point (currently no root page exists)
- New `messages/zh.json` and `messages/en.json` — translation files
- New `i18n/request.ts` — next-intl server configuration

</code_context>

<specifics>
## Specific Ideas

- Design system persisted at `design-system/clipflow/MASTER.md` — indigo+green palette, flat design style
- Full spec at `SPEC-landing-page.md` with detailed section copy in both languages
- CJK line-height must be 1.7+ (research finding: Tailwind default `leading-normal` 1.5 is too tight for Chinese)
- `<html lang>` cannot be changed dynamically in App Router — use `<div lang="...">` wrapper inside marketing layout

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
