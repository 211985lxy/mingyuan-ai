# Phase 04-01 Summary

**Status:** Complete
**Date:** 2026-03-26

## What was built

- Installed `next-intl@^4.8.3` (cookie-based locale, no URL routing)
- Created `apps/web/src/i18n/request.ts` — reads `locale` cookie, fallback to `zh`
- Updated `apps/web/next.config.ts` — wrapped with `createNextIntlPlugin()`
- Updated `apps/web/src/app/layout.tsx` — added `NextIntlClientProvider` around children
- Created `apps/web/messages/zh.json` and `messages/en.json` — identical key structure, real Navbar/Footer copy
- Created `apps/web/src/app/(marketing)/layout.tsx` — nested layout with Noto Sans SC (`preload: false`), `.marketing-page` wrapper, `lang` attribute
- Created `apps/web/src/app/(marketing)/page.tsx` — stub page proving `useTranslations()` works
- Updated `apps/web/src/app/globals.css` — CJK `line-height: 1.75` scoped to `.marketing-page`
- **Routing fix:** Moved `(dashboard)/page.tsx` → `(dashboard)/home/page.tsx` to resolve `/` conflict with marketing page; updated login redirect and sidebar links to `/home`
- Created `apps/web/.env.local` with placeholder DB/Redis URLs so `new URL("")` in `prisma.ts` doesn't throw during build (required for CI build; runtime uses real values)

## Acceptance Criteria — PASS

- [x] `next-intl` installed
- [x] `createNextIntlPlugin` in `next.config.ts`
- [x] `getRequestConfig` with `store.get("locale")` and `zh` fallback in `i18n/request.ts`
- [x] `NextIntlClientProvider` in root layout
- [x] Both translation files with identical key structures
- [x] `Navbar.cta` zh = `"免费开始"`, en = `"Start Free"`
- [x] `(marketing)/layout.tsx` has `marketing-page`, `Noto_Sans_SC`, `preload: false`
- [x] No `<html>` or `<body>` in marketing layout
- [x] `(marketing)/page.tsx` uses `useTranslations("Navbar")`, no `use client`
- [x] `globals.css` has `.marketing-page`, `line-height: 1.75`
- [x] `npm run build` passes
