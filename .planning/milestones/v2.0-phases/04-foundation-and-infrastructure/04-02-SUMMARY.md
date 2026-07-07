# Phase 04-02 Summary

**Status:** Complete
**Date:** 2026-03-26

## What was built

- Created `apps/web/src/components/marketing/language-switcher.tsx` — Client Component that writes `locale` cookie (max-age 31536000, SameSite=Lax) and calls `router.refresh()`
- Created `apps/web/src/components/marketing/marketing-navbar.tsx` — async Server Component with sticky header, logo, desktop `LanguageSwitcher` + green CTA button, mobile hamburger Sheet menu
- Created `apps/web/src/components/marketing/marketing-footer.tsx` — Server Component with translated copyright and tagline
- Updated `apps/web/src/app/(marketing)/layout.tsx` — wired `MarketingNavbar` before `<main>` and `MarketingFooter` after
- Updated `apps/web/src/app/(marketing)/page.tsx` — added `generateMetadata()` with locale-aware title, description, OG tags, and hreflang alternates
- Created `apps/web/public/og-image.png` — 1200×630 solid-indigo (#6366F1) PNG brand image

## Decisions

- `SheetTrigger` uses `@base-ui/react` (not Radix) — `asChild` prop not available; trigger renders via className styling instead
- OG image generated with Python stdlib (no external tool required) as a solid brand-color rectangle — sufficient for infrastructure phase; Phase 5/6 can enhance

## Acceptance Criteria — PASS

- [x] `language-switcher.tsx` starts with `"use client"`, writes `locale` cookie with 1-year max-age
- [x] `marketing-navbar.tsx` has `async function MarketingNavbar`, `useTranslations("Navbar")`, `LanguageSwitcher`, `getLocale`, `Sheet`
- [x] `marketing-navbar.tsx` has no `"use client"`
- [x] `marketing-footer.tsx` has `useTranslations("Footer")`, `t("copyright")`, `t("tagline")`
- [x] `(marketing)/layout.tsx` contains `MarketingNavbar` and `MarketingFooter`
- [x] `(marketing)/page.tsx` has `export async function generateMetadata` reading `locale` cookie
- [x] OG image exists at `public/og-image.png` (11312 bytes, valid PNG, 1200×630)
- [x] `npm run build` passes
