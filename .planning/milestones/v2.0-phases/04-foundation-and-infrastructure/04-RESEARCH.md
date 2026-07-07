# Phase 4: Foundation and Infrastructure - Research

**Researched:** 2026-03-26
**Domain:** Next.js 16 App Router — i18n infrastructure, route group isolation, CJK typography, SEO metadata
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- i18n library: `next-intl@^4.8.3` with cookie-based locale (`localePrefix: 'never'`)
- Font: Noto Sans SC via `next/font/google` with `preload: false` and `display: swap`
- CSS isolation: `.marketing-page` wrapper class in marketing layout
- Route: `(marketing)` route group with nested layout (NOT a second root layout — no `<html>`/`<body>`)
- Components: Default Server Components; `"use client"` only for language switcher and interactive elements
- `next.config.ts`: Wrap with `createNextIntlPlugin()`
- Translation files at `apps/web/messages/zh.json` and `apps/web/messages/en.json` — next-intl convention
- Default locale detection via `NEXT_LOCALE` cookie, fallback to `zh-CN` (Chinese primary audience)
- Flat per-section namespace: `"Hero.title"`, `"PainPoints.heading"`, `"HowItWorks.step1"` — simple, grepable, no nesting
- Sticky top navbar with subtle backdrop blur on scroll
- Mobile navigation via hamburger menu with shadcn Sheet slide-in panel
- Language switcher placed right side of navbar, before CTA button
- Title format: `ClipFlow - AI 营销短视频流水线` (zh) / `ClipFlow - AI Video Marketing Pipeline` (en)
- Single branded OG image (1200x630) with bilingual text — static asset in `public/`
- hreflang via `generateMetadata()` in marketing layout with `alternates.languages`
- `<div lang="...">` wrapper inside marketing layout for dynamic lang attribute (root `<html lang>` cannot change without full reload)

### Claude's Discretion

None specified — all decisions were made in the discuss phase.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | User can switch between Chinese and English on the landing page via a language toggle, with preference persisted across sessions | Cookie-based locale via next-intl, LanguageSwitcher writes `locale` cookie + `router.refresh()`, `i18n/request.ts` reads cookie server-side |
| INFRA-02 | Landing page uses a dedicated `(marketing)` route group with its own layout (navbar + footer), separate from the dashboard layout | `app/(marketing)/layout.tsx` as nested layout (no `<html>`/`<body>`), `.marketing-page` wrapper for CSS isolation |
| INFRA-03 | All landing page copy is stored in bilingual JSON translation files (zh-CN + en), not hardcoded in components | `messages/zh.json` and `messages/en.json` at monorepo app root, flat namespace keys, `useTranslations()` in every section component |
| INFRA-04 | CJK text renders correctly with Noto Sans SC font and appropriate line-height (1.7+) | `Noto_Sans_SC` via `next/font/google` with `preload: false`, CSS scoped to `.marketing-page`, `leading-relaxed` minimum for Chinese copy |
| INFRA-05 | Landing page has proper SEO metadata (title, description, OG tags) and hreflang for both locales | `generateMetadata()` async function reading locale cookie, `alternates.languages` for hreflang, static OG image in `public/` |
</phase_requirements>

---

## Summary

Phase 4 establishes five technical primitives that all subsequent content phases depend on: the `(marketing)` route group, the next-intl i18n infrastructure, CJK font rendering, CSS isolation from the dashboard, and SEO metadata generation. None of these require new package research — the stack decisions are fully locked. This phase is a pure implementation task against a well-researched set of decisions.

The critical implementation risk is sequencing: the i18n infrastructure (`next-intl` install, `next.config.ts` change, `i18n/request.ts`, `messages/*.json`) must land before any component that calls `useTranslations()` is written. The route group shell and CSS isolation can proceed in parallel with the translation file authorship. Font loading must be configured before the marketing layout is reviewed visually — the wrong font configuration is invisible during development on macOS (PingFang SC silently substitutes) but broken on Windows (SimSun renders with no bold weight).

The `(marketing)` route group is additive: zero changes to `(auth)` or `(dashboard)` routes. The only two files that must be modified are `next.config.ts` (additive wrapper) and `app/layout.tsx` (add `NextIntlClientProvider` around children).

**Primary recommendation:** Build in this order — (1) install next-intl + configure next.config.ts + create i18n/request.ts, (2) create messages/zh.json + messages/en.json with placeholder keys for all sections, (3) create (marketing)/layout.tsx shell with .marketing-page wrapper, (4) wire generateMetadata() with cookie read and hreflang, (5) implement MarketingNavbar + LanguageSwitcher, (6) validate end-to-end with a minimal page.tsx.

---

## Project Constraints (from CLAUDE.md)

| Directive | How It Applies to This Phase |
|-----------|------------------------------|
| UI components must use `shadcn/ui` only | MarketingNavbar uses `Button` from shadcn; mobile menu uses `Sheet`; language switcher uses `Button` with `variant="ghost"` |
| Zero Mock Rule | No mock translation fallbacks, no hardcoded strings "just for now," no placeholder locales — translation files must contain real copy before the phase is considered complete |
| `ui-ux-pro-max` skill must be invoked for UI work | When implementing MarketingNavbar, MarketingFooter, and layout shell, planner must invoke the skill per the design system at `design-system/clipflow/MASTER.md` |
| All UI-related work must invoke `ui-ux-pro-max` skill first | Phase plans that create any visual component must include a step to consult the design system before writing JSX |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next-intl` | 4.8.3 (latest stable, verified 2026-03-26) | Cookie-based locale switching, `useTranslations()` hook, `getLocale()` for server components | Only App Router-native i18n library with full Server Component support, type-safe keys, and `localePrefix: 'never'` mode. v4.x supports Next.js 16's `proxy.ts` naming |
| `next/font/google` | built into Next.js 16.1.7 | Noto Sans SC CJK font loading with automatic build-time subsetting | Zero runtime cost, automatic `unicode-range`, `size-adjust` calculation for CLS prevention |
| `next/image` | built into Next.js 16.1.7 | OG image static asset serving, any hero images | Already present; note Next.js 16 API: `preload` replaces deprecated `priority`, `quality` is now required |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn `Sheet` | ^4.0.8 (already installed) | Mobile hamburger slide-in navigation panel | Mobile viewport navbar only |
| shadcn `Button` | ^4.0.8 (already installed) | Language switcher button, CTA button | All interactive buttons in marketing layout |
| `tw-animate-css` | ^1.4.0 (already installed) | `animate-in`, `fade-in-0`, `slide-in-from-*` classes for navbar transitions | Navbar backdrop blur, scroll effects — no new package needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `next-intl` with cookie | Custom typed JSON + React context | Custom approach has zero library overhead but requires hand-rolling hydration safety, type inference, and server/client sync. Not worth it for a maintained codebase with 2+ phases of i18n content |
| Static `public/og-zh.png` + `public/og-en.png` | `next/og` ImageResponse | Dynamic OG requires a route handler and adds complexity. A single bilingual OG image (bilingual text overlay) is a valid and simpler choice for this phase |

**Installation:**
```bash
cd apps/web && npm install next-intl
```

**Version verification:** `next-intl` 4.8.3 confirmed latest stable on 2026-03-26 via `npm view next-intl version`.

---

## Architecture Patterns

### Recommended Project Structure

```
apps/web/
├── messages/                               # NEW
│   ├── zh.json                             # zh-CN translations (primary)
│   └── en.json                             # English translations (secondary)
└── src/
    ├── i18n/
    │   └── request.ts                      # NEW — next-intl server config (cookie read)
    ├── app/
    │   ├── layout.tsx                      # MODIFIED — add NextIntlClientProvider
    │   ├── globals.css                     # UNCHANGED
    │   ├── (marketing)/
    │   │   ├── layout.tsx                  # NEW — .marketing-page wrapper, MarketingNavbar, MarketingFooter
    │   │   └── page.tsx                    # NEW — minimal entry point for this phase (section stubs)
    │   ├── (auth)/                         # UNCHANGED
    │   ├── (dashboard)/                    # UNCHANGED
    │   └── api/                            # UNCHANGED
    └── components/
        └── marketing/                      # NEW
            ├── marketing-navbar.tsx        # Server component — reads locale via getLocale()
            ├── marketing-footer.tsx        # Server component — placeholder
            └── language-switcher.tsx       # "use client" — cookie write + router.refresh()
```

**Note for Phase 4:** Only the infrastructure shell is built. Section components (`hero-section.tsx`, etc.) are created in Phase 5. The `page.tsx` created in Phase 4 can be a minimal stub that proves the route resolves and translations load.

### Pattern 1: next-intl Cookie-Based Configuration (No URL Routing)

**What:** `i18n/request.ts` reads locale from a cookie on every server render. The URL never changes. Language preference persists across sessions via a 1-year cookie.

**When to use:** Single marketing page, 2 locales, no need for locale-visible URLs, auth and dashboard routes must remain unaffected.

**Example — `src/i18n/request.ts`:**
```typescript
// Source: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
import { cookies } from "next/headers"
import { getRequestConfig } from "next-intl/server"

export default getRequestConfig(async () => {
  const store = await cookies()
  const locale = store.get("locale")?.value ?? "zh"

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  }
})
```

**Example — `next.config.ts` change (additive only):**
```typescript
// Source: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
import path from "node:path"
import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const withNextIntl = createNextIntlPlugin()

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
}

export default withNextIntl(nextConfig)
```

**Example — `app/layout.tsx` change (add NextIntlClientProvider, additive):**
```typescript
// Wrap children in NextIntlClientProvider — required for Client Components to use useTranslations()
import { NextIntlClientProvider } from "next-intl"
import { getMessages } from "next-intl/server"

// Inside RootLayout:
const messages = await getMessages()
// ...
<BrandingProvider branding={branding}>
  <NextIntlClientProvider messages={messages}>
    <TooltipProvider>{children}</TooltipProvider>
  </NextIntlClientProvider>
</BrandingProvider>
```

### Pattern 2: Nested Marketing Layout (Not Second Root Layout)

**What:** `(marketing)/layout.tsx` wraps children in `.marketing-page` div, adds `MarketingNavbar` and `MarketingFooter`. Does NOT declare `<html>` or `<body>`. The `<div lang="...">` wrapper sets the language attribute for the marketing section without requiring a full-page reload.

**When to use:** Route group needs unique chrome while sharing the HTML document shell with auth and dashboard groups.

**Example — `app/(marketing)/layout.tsx`:**
```typescript
// Source: Next.js App Router route groups docs
import { getLocale } from "next-intl/server"
import { MarketingNavbar } from "@/components/marketing/marketing-navbar"
import { MarketingFooter } from "@/components/marketing/marketing-footer"

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()

  return (
    <div className="marketing-page flex flex-col min-h-screen" lang={locale === "zh" ? "zh-CN" : "en"}>
      <MarketingNavbar />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  )
}
```

### Pattern 3: Language Switcher (Client Component)

**What:** Writes a `locale` cookie client-side and triggers `router.refresh()` to cause a server re-render with the new locale. No page reload occurs — React RSC streaming replaces page content.

**Example — `components/marketing/language-switcher.tsx`:**
```typescript
"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export function LanguageSwitcher({ currentLocale }: { currentLocale: string }) {
  const router = useRouter()

  const toggle = () => {
    const next = currentLocale === "zh" ? "en" : "zh"
    document.cookie = `locale=${next}; path=/; max-age=31536000; SameSite=Lax`
    router.refresh()
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} className="cursor-pointer">
      {currentLocale === "zh" ? "EN" : "中文"}
    </Button>
  )
}
```

### Pattern 4: SEO Metadata with Cookie-Based Locale

**What:** `generateMetadata()` in `(marketing)/page.tsx` reads locale from cookie and returns locale-appropriate title, description, OG tags, and hreflang alternates.

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
import { cookies } from "next/headers"
import type { Metadata } from "next"

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies()
  const locale = store.get("locale")?.value ?? "zh"
  const isZh = locale === "zh"

  return {
    title: isZh
      ? "ClipFlow - AI 营销短视频流水线"
      : "ClipFlow - AI Video Marketing Pipeline",
    description: isZh
      ? "小企业主的 AI 视频创作助手——输入文案，自动生成专业营销短视频"
      : "AI-powered video creation for small businesses — from copy to professional marketing video",
    openGraph: {
      title: isZh ? "ClipFlow - AI 营销短视频流水线" : "ClipFlow - AI Video Marketing Pipeline",
      description: isZh
        ? "小企业主的 AI 视频创作助手"
        : "AI-powered video creation for small businesses",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
      locale: isZh ? "zh_CN" : "en_US",
      type: "website",
    },
    alternates: {
      canonical: "https://clipflow.ai/",
      languages: {
        "zh-CN": "https://clipflow.ai/",
        "en": "https://clipflow.ai/",
        "x-default": "https://clipflow.ai/",
      },
    },
  }
}
```

### Pattern 5: CJK Font Configuration

**What:** Load Noto Sans SC via `next/font/google` with `preload: false` to prevent 5-10MB eager preload. Apply only to `.marketing-page` scope to avoid affecting dashboard typography.

**Example — `(marketing)/layout.tsx` font setup:**
```typescript
import { Noto_Sans_SC } from "next/font/google"

const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sans-sc",
  subsets: ["chinese-simplified"],
  weight: ["400", "500", "700"],
  preload: false,      // CRITICAL — prevents 5-10MB eager download
  display: "swap",
})

// Apply to the wrapper div:
<div className={`marketing-page flex flex-col min-h-screen ${notoSansSC.variable}`} lang={...}>
```

**CSS override scoped to `.marketing-page` (add to globals.css or a marketing-specific layer):**
```css
/* Scoped to marketing only — does NOT affect dashboard */
.marketing-page {
  --font-sans: var(--font-sans), var(--font-noto-sans-sc), system-ui, sans-serif;
}

.marketing-page [lang="zh-CN"],
.marketing-page .zh-copy {
  line-height: 1.75;
  letter-spacing: 0.02em;
}
```

**Tailwind line-height for Chinese copy:** Use `leading-relaxed` (1.625) as minimum. Never use `leading-tight`, `leading-snug`, or `leading-normal` for Chinese text.

### Pattern 6: Translation File Structure

**What:** Flat namespaced keys, one file per locale. All marketing copy lives here — nothing hardcoded in JSX.

**`messages/zh.json` skeleton (Phase 4 must define key structure; copy content follows in Phase 5):**
```json
{
  "Navbar": {
    "logo": "ClipFlow",
    "cta": "免费开始"
  },
  "Hero": {
    "title": "",
    "subtitle": "",
    "cta": "",
    "ctaSecondary": ""
  },
  "PainPoints": {
    "heading": "",
    "pain1Title": "", "pain1Desc": "",
    "pain2Title": "", "pain2Desc": "",
    "pain3Title": "", "pain3Desc": ""
  },
  "HowItWorks": {
    "heading": "",
    "step1Title": "", "step1Desc": "",
    "step2Title": "", "step2Desc": "",
    "step3Title": "", "step3Desc": ""
  },
  "Features": {
    "heading": "",
    "feature1Title": "", "feature1Desc": "",
    "feature2Title": "", "feature2Desc": "",
    "feature3Title": "", "feature3Desc": ""
  },
  "Differentiators": {
    "heading": "",
    "diff1Title": "", "diff1Desc": "",
    "diff2Title": "", "diff2Desc": ""
  },
  "SocialProof": {
    "heading": "",
    "stat1Value": "", "stat1Label": "",
    "stat2Value": "", "stat2Label": "",
    "stat3Value": "", "stat3Label": ""
  },
  "CTA": {
    "heading": "",
    "subtext": "",
    "button": ""
  },
  "Footer": {
    "copyright": "",
    "contact": ""
  }
}
```

`messages/en.json` must have exactly the same key structure (TypeScript type checking enforces this if TypeScript strict mode is used with next-intl's type generation).

### Anti-Patterns to Avoid

- **Second root layout:** Adding `<html>/<body>` to `(marketing)/layout.tsx` causes full-page reloads on navigation to auth/dashboard. Do not do this.
- **localStorage for locale:** Causes hydration mismatch. Use cookie only.
- **Hardcoded Chinese strings in JSX:** Any string that should be translatable goes in `messages/*.json`. Zero exceptions.
- **`export const metadata` instead of `generateMetadata()`:** Static metadata cannot read the locale cookie. SEO breaks for one language.
- **`useTranslations()` in every section as client component:** Adds translation bundle weight. Keep sections as Server Components; translations run server-side.
- **Noto Sans SC `preload: true` (default):** 5-10MB eager download, LCP collapses.
- **Marketing CSS rules on global selectors (`h1`, `p`, `.container`):** Bleeds into dashboard. Scope everything under `.marketing-page`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| i18n message lookup with locale switching | Custom dictionary + context + hydration guard | `next-intl` | Hydration safety, server component support, type-safe keys, ICU formatting — all solved |
| CJK font loading with subsetting | Manual `@font-face` + CSS unicode-range | `next/font/google` with `Noto_Sans_SC` | Automatic subsetting, `size-adjust` for CLS prevention, build-time optimization |
| Image optimization for OG asset | Raw `<img>` tag | `next/image` with explicit dimensions | Automatic WebP, srcset, CLS prevention via dimension reservation |
| Cookie write + page refresh for language | Full page reload (`window.location.reload()`) | `document.cookie` + `router.refresh()` | router.refresh() triggers RSC re-render without full browser reload, preserving scroll position |
| SEO metadata with locale awareness | Client-side `document.title =` in useEffect | `generateMetadata()` async function | Server-rendered meta tags are crawlable; client-side title changes are invisible to search engines |

**Key insight:** The entire i18n stack (library, font, image, SEO) is solved by Next.js built-ins and one package install. Any hand-rolled alternative creates a maintenance surface without providing better capability.

---

## Common Pitfalls

### Pitfall 1: Noto Sans SC Eager Preload Kills Mobile LCP

**What goes wrong:** Default `next/font/google` behavior with a CJK font downloads the full subset (~5-10MB) on every page load. Mobile LCP spikes to 3-5 seconds.

**Why it happens:** Developer sets up the font analogously to Plus Jakarta Sans (which has `preload` defaulting to `true`). CJK font files are orders of magnitude larger.

**How to avoid:** Set `preload: false` explicitly. This is already in the locked decisions.

**Warning signs:** Lighthouse mobile LCP > 3s; network waterfall shows 2+ MB font download on critical path.

### Pitfall 2: Plus Jakarta Sans Has No CJK Glyphs

**What goes wrong:** Without Noto Sans SC configured, Chinese text silently falls back to SimSun on Windows (no bold weight, thin rendering) or PingFang SC on macOS. Problem is invisible during macOS development.

**How to avoid:** Configure Noto Sans SC as `--font-noto-sans-sc` in the marketing layout and include it in the font-family stack via `.marketing-page` CSS.

**Warning signs:** Chinese headings look different in design review vs. macOS development screenshots.

### Pitfall 3: Hydration Mismatch from Wrong Cookie Name

**What goes wrong:** `i18n/request.ts` reads cookie named `"locale"` but `LanguageSwitcher` writes cookie named `"NEXT_LOCALE"` (or vice versa). Server renders in `zh`, client refreshes but server still reads the old cookie name, leading to locale not persisting.

**How to avoid:** Both files must use exactly the same cookie name. Research confirms next-intl's own `setRequestLocale()` approach for routing uses `NEXT_LOCALE` as the cookie name internally, but the cookie-based approach in `i18n/request.ts` reads whatever name you define. Pick one name and use it consistently: `"locale"` is recommended as it avoids confusion with next-intl's internal routing cookie.

**Warning signs:** Language toggle appears to work visually but resets on next page reload.

### Pitfall 4: Missing hreflang Causes Duplicate Content Penalty

**What goes wrong:** Both language versions served at the same URL with no `hreflang` annotation. Google may de-index one language version or serve the wrong one to users.

**How to avoid:** Include self-referencing `hreflang` with `x-default` in `generateMetadata()` from day one. This is already specified in the locked decisions.

### Pitfall 5: `<html lang>` Cannot Be Changed Dynamically

**What goes wrong:** Developer attempts to set `lang` attribute dynamically via React state — no effect, because the root layout's `<html lang="zh-CN">` is rendered once and not re-rendered on client navigation.

**How to avoid:** Use `<div lang={locale === "zh" ? "zh-CN" : "en"}>` as the outer wrapper in `(marketing)/layout.tsx`. This is semantically valid per the HTML spec and accepted by accessibility validators. The root `<html lang="zh-CN">` remains but the marketing page overrides it at the section level.

### Pitfall 6: NextIntlClientProvider Missing — Client Components Cannot Use Translations

**What goes wrong:** If `NextIntlClientProvider` is not added to the root layout (or marketing layout), Client Components that call `useTranslations()` throw at runtime: "Unable to find NextIntlClientProvider."

**How to avoid:** Add `NextIntlClientProvider` wrapping children in `app/layout.tsx`. Pass `messages` from `getMessages()`. This is listed as a required modification in the locked decisions.

### Pitfall 7: dashboard CSS Bleeds Into Marketing Page

**What goes wrong:** `globals.css` contains sidebar color tokens (`--sidebar`, `--sidebar-primary`, etc.) that are globally scoped. Marketing page elements may inherit unexpected color values from these tokens.

**How to avoid:** All marketing-specific token overrides go under `.marketing-page { ... }` scope. Never target `h1`, `p`, `.container`, or `:root` from the marketing layout. Use Tailwind utility classes instead of adding global rules.

---

## Code Examples

Verified patterns from official sources:

### Reading Locale in a Server Component

```typescript
// Source: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
import { getLocale, useTranslations } from "next-intl/server"

export default async function MarketingNavbar() {
  const locale = await getLocale()
  const t = useTranslations("Navbar")

  return (
    <nav>
      <span>{t("logo")}</span>
      <LanguageSwitcher currentLocale={locale} />
    </nav>
  )
}
```

### Using Translations in a Server Component

```typescript
// Source: https://next-intl.dev/docs/environments/server-client-components
import { useTranslations } from "next-intl"

// NO "use client" directive — this runs on the server
export function PainPointsSection() {
  const t = useTranslations("PainPoints")
  return (
    <section>
      <h2>{t("heading")}</h2>
    </section>
  )
}
```

### Navbar with Backdrop Blur on Scroll (CSS-Only, No JS Required)

```css
/* globals.css — scoped under .marketing-page */
.marketing-page .marketing-nav {
  position: sticky;
  top: 0;
  z-index: 50;
  transition: background-color 200ms ease, backdrop-filter 200ms ease;
}

/* Use scroll-driven animation or Tailwind: */
/* class="sticky top-0 z-50 bg-white/80 backdrop-blur-sm border-b border-gray-100 transition-all duration-200" */
```

### OG Image Static Asset

Place a 1200x630 PNG at `apps/web/public/og-image.png`. The `generateMetadata()` references it as `/og-image.png`. No additional configuration needed — Next.js serves `public/` assets at the root path.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` for next-intl routing | `proxy.ts` with exported `proxy` function | Next.js 16 | This phase uses cookie-based approach with no routing, so `proxy.ts` is NOT needed at all |
| `priority` prop on `next/image` | `preload` prop | Next.js 16 | Hero images should use `preload` not `priority` |
| `framer-motion` package | `motion` package (`motion/react` import) | 2024 | Not needed for Phase 4; no animation library required for the infrastructure shell |
| `tailwindcss-animate` | `tw-animate-css` | Tailwind v4 era | Already installed; provides all needed animation classes |
| next-intl `messages` prop on `NextIntlClientProvider` | Auto-inherited from `getMessages()` | next-intl 4.x | In v4.x, `NextIntlClientProvider` auto-inherits when `messages` is passed via `getMessages()` — explicit prop is optional for most setups |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install | Yes | v25.6.1 | — |
| npm | Package install | Yes | 11.9.0 | — |
| `next-intl` | INFRA-01, INFRA-03 | Not installed (needs install) | latest 4.8.3 | — |
| `next/font/google` | INFRA-04 | Built into Next.js 16.1.7 | 16.1.7 | — |
| `next/image` | INFRA-05 (OG) | Built into Next.js 16.1.7 | 16.1.7 | — |
| shadcn `Sheet` | INFRA-02 (mobile nav) | Installed (src/components/ui/sheet.tsx) | ^4.0.8 | — |
| shadcn `Button` | INFRA-02 (navbar CTA) | Installed (src/components/ui/button.tsx) | ^4.0.8 | — |

**Missing dependencies with no fallback:**
- `next-intl` must be installed before any translation-aware code can run.

**Missing dependencies with fallback:**
- None.

---

## Validation Architecture

> `workflow.nyquist_validation` is not set in `.planning/config.json` (only `_auto_chain_active: false` is present) — treating as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None detected — no `jest.config.*`, `vitest.config.*`, or `playwright.config.*` found in `apps/web/` |
| Config file | Not present (Wave 0 gap) |
| Quick run command | `npm run build --prefix apps/web` (build-time type check as proxy for unit tests) |
| Full suite command | Manual browser verification (language switch, metadata curl check) — see Wave 0 gaps |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Language toggle sets cookie, page re-renders in new locale | Integration (manual) | `curl -s http://localhost:3000 -H "Cookie: locale=en"` should return English title | ❌ Wave 0 (manual) |
| INFRA-02 | `(marketing)` route resolves at `/`, no dashboard sidebar visible | Smoke | `curl -s http://localhost:3000` returns 200 with `marketing-page` class | ❌ Wave 0 (manual) |
| INFRA-03 | All text in JSX comes from `t()` calls, no hardcoded strings | Static (grep) | `grep -r "ClipFlow\|AI视频\|AI 视频" apps/web/src/components/marketing/` should return zero | ❌ Wave 0 |
| INFRA-04 | CJK renders with Noto Sans SC, line-height >= 1.7 | Visual (manual) | DevTools font inspector on Windows/Chrome; CSS audit | ❌ Wave 0 (manual) |
| INFRA-05 | hreflang and OG tags present in page `<head>` | Smoke | `curl -s http://localhost:3000 \| grep -E "(hreflang\|og:title\|og:image)"` returns matches | ❌ Wave 0 (manual) |

### Sampling Rate

- **Per task commit:** `npm run build --prefix apps/web` (TypeScript compilation, catches missing translation keys and import errors)
- **Per wave merge:** Manual browser test of language switch + `curl` metadata check
- **Phase gate:** All 5 INFRA requirements verified manually before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] No test framework configured — build check (`npm run build`) is the automated proxy for this phase. TypeScript strict mode + next-intl type generation catches missing translation keys at build time.
- [ ] INFRA-03 can be validated with a grep command (no framework needed): `grep -rn "ClipFlow\|短视频\|AI视频" apps/web/src/components/marketing/` should return zero matches after implementation.
- [ ] INFRA-05 curl check is runnable without a framework: `curl -s http://localhost:3000 | grep -E "hreflang|og:title"`.

---

## Open Questions

1. **OG image content**
   - What we know: A static 1200x630 PNG is the chosen approach; it should contain bilingual text per the locked decisions.
   - What's unclear: Does `public/og-image.png` already exist, or does it need to be created as part of Phase 4? The `SPEC-landing-page.md` file exists but was not read for this research — it may contain OG image specs.
   - Recommendation: Planner should check `SPEC-landing-page.md` for OG image design specs. If no image exists, Phase 4 should include creating a placeholder OG image (plain text on branded background is acceptable for launch).

2. **Translation file content for Phase 4**
   - What we know: Phase 4 must define all key names in `messages/zh.json` and `messages/en.json`; Phase 5 fills in content for sections. The navbar and footer keys need actual copy in Phase 4 since they appear in the shell.
   - What's unclear: Does Phase 4 author real navbar/footer copy, or only define the schema? The Zero Mock Rule implies real copy.
   - Recommendation: Phase 4 should include real zh/en strings for Navbar and Footer sections (these are short). Section keys (Hero, PainPoints, etc.) can be empty strings as placeholders — they are not rendered until Phase 5 uses them.

3. **`next-intl` `NextIntlClientProvider` message auto-inheritance in v4.x**
   - What we know: In next-intl v4.x, `NextIntlClientProvider` auto-inherits messages when `getMessages()` is used — explicit `messages` prop may not be needed.
   - What's unclear: Whether "auto-inherit" means the provider itself needs no prop, or whether `getMessages()` must still be called and passed.
   - Recommendation: Pass `messages={await getMessages()}` explicitly to be safe. The documentation for the "without i18n routing" setup shows this pattern as standard. Explicitly passing is never wrong; omitting it may cause runtime errors if auto-inherit doesn't apply in this configuration.

---

## Sources

### Primary (HIGH confidence)

- next-intl v4.x docs — App Router without i18n routing: https://next-intl.dev/docs/getting-started/app-router/without-i18n-routing
- next-intl npm registry — Version 4.8.3 confirmed latest stable (verified 2026-03-26): `npm view next-intl version`
- Next.js 16 Upgrade Guide — `priority` → `preload`, `middleware.ts` → `proxy.ts`: https://nextjs.org/docs/app/guides/upgrading/version-16
- Next.js App Router route groups docs: https://nextjs.org/docs/app/api-reference/file-conventions/route-groups
- Next.js `generateMetadata()` API reference: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Codebase inspection (direct read, 2026-03-26):
  - `apps/web/src/app/layout.tsx` — confirms Plus Jakarta Sans, lang="zh-CN", no existing i18n
  - `apps/web/next.config.ts` — confirms current config, no next-intl wrapper yet
  - `apps/web/src/app/globals.css` — confirms Tailwind v4, oklch theme, sidebar tokens
  - `apps/web/src/components/ui/` — confirms sheet.tsx and button.tsx are installed
  - `apps/web/package.json` — confirms next-intl is NOT installed; next 16.1.7, react 19.2.3
  - `.planning/research/STACK.md` — milestone stack research, HIGH confidence
  - `.planning/research/ARCHITECTURE.md` — milestone architecture research, HIGH confidence
  - `.planning/research/PITFALLS.md` — milestone pitfalls research, HIGH confidence
  - `design-system/clipflow/MASTER.md` — Indigo+green palette, flat design, Plus Jakarta Sans typography

### Secondary (MEDIUM confidence)

- next-intl Server/Client Components performance guidance: https://next-intl.dev/docs/environments/server-client-components
- CJK typography line-height best practices (1.7+ required for zh-CN): multiple sources in PITFALLS.md

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — next-intl 4.8.3 verified on npm registry; Next.js 16 API confirmed via upgrade guide; all other dependencies present in codebase
- Architecture: HIGH — based on direct codebase inspection + milestone architecture research (ARCHITECTURE.md)
- Pitfalls: HIGH — based on milestone pitfalls research (PITFALLS.md) + direct codebase inspection confirming each risk is real

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (stable libraries — 30-day window)
