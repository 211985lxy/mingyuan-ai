# Feature Research

**Domain:** Bilingual SaaS AI video tool landing page (zh-CN primary, English secondary)
**Researched:** 2026-03-26
**Confidence:** HIGH (patterns verified across multiple SaaS landing page analyses + Chinese market sources)

---

## Context

This document covers the feature landscape for ClipFlow's v2.0 milestone: a bilingual marketing landing
page targeting small business owners who need personal IP video content with zero production skills.
The existing app (three-layer pipeline, AI scripts, Shanjian rendering) is already built — this page
must *explain* and *convert*, not demo new product functionality.

**Primary conversion goal:** Free trial / signup
**Primary audience:** zh-CN small business owners building personal IP on short-video platforms
**Secondary audience:** English-speaking small business owners (same persona, different language)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that any credible SaaS landing page must have. Missing these signals that the product is
unfinished or untrustworthy — visitors leave before scrolling.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Hero section with clear value prop | Every SaaS page has one — visitors judge within 3 seconds whether to stay | LOW | Headline must answer "who is this for + what result do they get." For ClipFlow: "No video skills needed — professional marketing videos in minutes" |
| Primary CTA above the fold | Visitors expect to act immediately if convinced; buried CTAs lose momentum | LOW | Single primary CTA in hero: "Start Free" or "免费开始." No secondary CTA competing in the same visual zone |
| How It Works section (3-step process) | Visitors need to know the workflow is simple before trusting a new tool | LOW | "3-step" pattern is standard: (1) Input your business info → (2) AI generates script + structure → (3) Download your video. Maps to Director/Scriptwriter/Packaging but must NOT use internal layer names |
| Social proof section | Any tool asking for signup needs evidence it works | MEDIUM | At minimum: user count, testimonial quotes, or sample output. No social proof = no trust |
| Mobile-first responsive layout | >60% of Chinese short-video creator traffic is mobile; missing mobile = lost conversions | MEDIUM | 375px → 1440px breakpoints. shadcn/ui components + Tailwind responsive utilities |
| Language switcher | Bilingual audience expects to control language; default zh-CN, English toggle in navbar | LOW | Cookie-based locale (`NEXT_LOCALE` cookie via next-intl `localePrefix: 'never'`). Switcher shows "中文 / EN" |
| Navigation bar with logo | Brand trust anchor; users expect to find the product name immediately | LOW | Logo + product name + language switcher + CTA button in nav |
| Footer with links | Site completeness signal; Chinese market specifically looks for company info/contact | LOW | Company info, contact, links to Chinese social accounts, WeChat QR code optional |
| Page speed (LCP < 2.5s) | Slow page = users leave. Every 1s delay reduces conversion 7% | MEDIUM | Next.js Image optimization, lazy loading for below-fold content, CSS-only animations |
| Final CTA section | Repeat the offer at page end for visitors who scrolled but didn't act in hero | LOW | Stronger language than hero CTA: "Start your first video free today" |

### Differentiators (Competitive Advantage)

Features that go beyond the minimum and make ClipFlow's landing page meaningfully more effective
at converting skeptical small business owners who have tried other AI tools before.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Pain points section using small business owner language | Generic AI tools say "create content fast." ClipFlow must resonate with the specific emotional pain: "I know I need videos but I don't know where to start" | LOW | Section 2 of page. 3 pain points max: (1) No time or skills for video, (2) AI tools produce generic content not about my business, (3) Building personal IP feels complicated. Each has a short empathy line |
| Three-layer system explained visually (without jargon) | The Director→Scriptwriter→Packaging architecture is a genuine differentiator vs competitors, but only if explained in outcome language, not technical terms | MEDIUM | Section 4: "Director" = "Video Structure AI," "Scriptwriter" = "Script AI," "Packaging" = "Visual Assembly." Use icons (Lucide) + one-line outcome per layer. No code/technical language |
| Sample output / before-after demo | AI video tools live or die on "does it actually look good?" Showing a real output removes the biggest purchase barrier | MEDIUM | Embed a real Shanjian-rendered output video or animated GIF. "Zero Mock Rule" applies — must be a real render. If video is not embeddable, show screenshot sequence |
| IP profile personalization callout | Competitors produce generic videos; ClipFlow inputs your business profile, tone, offer, audience. This is rare and worth highlighting | LOW | Feature card: "Videos about YOUR business, not generic B-roll" |
| Hot topic intelligence mention | ClipFlow can detect trending topics and fit them to the business — no other tool in this category does this | LOW | Brief mention in features section. One line + icon. Not the primary selling point |
| WeChat QR code in footer | Chinese small business owners trust products with established WeChat presence | LOW | Optional but high-value trust signal for zh-CN audience. Show official WeChat account QR or service account QR if available |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like good ideas but reduce conversion rate, add complexity without value, or create
maintenance burden disproportionate to their benefit.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Pricing section on landing page | "Let users know the cost upfront" | For a freemium or trial-first product, showing pricing before demonstrating value loses visitors who haven't yet seen the product. Pricing objections are pre-empted, not addressed. | Place pricing only on a separate `/pricing` route. Landing page CTA drives to signup, not pricing. Handle pricing in-app after first value moment |
| Live chat widget | "Real-time support builds trust" | Third-party chat widgets (Intercom, Drift) add 200-500ms load time, GDPR complexity, and require ongoing staffing. For a Chinese audience, they prefer WeChat/WeCom over Western chat tools | Show WeChat QR code or contact email. Consider in-app chat only after signup |
| Video autoplay with sound | "Demo video is the best conversion tool" | Autoplay with sound violates browser autoplay policies (blocked on mobile), annoys users, and increases bounce rate. Chinese users on mobile with public transit context are particularly sensitive to unexpected audio | Autoplay muted with play button. Or use animated screenshot sequence as fallback |
| Feature checklist of 12+ items | "Show everything the product does" | Lists with more than 5-6 items cause decision paralysis. Visitors stop reading and bounce. | 3 core features per section. Each gets icon + headline + one-sentence benefit. No bullet-point dumps |
| Multiple competing CTAs in hero | "Give users options: signup, watch demo, learn more" | Competing CTAs in the same viewport reduce click rate on all of them. The "paradox of choice" is well-documented for landing pages. | One primary CTA above fold. One secondary (lower contrast/weight) at most: "See how it works" scrolls to How It Works section |
| Separate EN/ZH page routes | "Better SEO with separate URLs per language" | URL-prefixed routing (`/zh/`, `/en/`) requires middleware, changes link sharing behavior, and splits analytics. For a product-focused landing page with one primary language, it's over-engineering. | Cookie-based locale via next-intl (`localePrefix: 'never'`). One URL, locale stored in cookie. Simpler implementation, acceptable SEO tradeoff |
| Blog / content section on landing page | "Content marketing builds trust" | Blog links pull visitors away from the conversion funnel. Landing page is not a website — it's a conversion surface. | Keep blog on a separate route (`/blog`). Do not link from hero or main content. Footer link only if it exists |
| Real-time user count (live counter) | "Shows social proof dynamically" | Fake-looking live counters damage trust (users recognize the pattern). Honest static stats are more credible. | "X businesses have created videos with ClipFlow" — static, updated monthly. More credible than animated counters |

---

## Section Structure (Recommended Page Layout)

The 7-section structure defined in PROJECT.md maps to the conversion decision model:

```
Section 1: NAVBAR
    Purpose: Brand + navigation + language switcher + primary CTA
    Decision served: Orientation ("Is this a real product?")

Section 2: HERO
    Purpose: Who it's for + what result + primary CTA
    Decision served: Orientation ("Is this relevant to me?")
    CTA: Primary button — "免费开始" / "Start Free"

Section 3: PAIN POINTS
    Purpose: Empathy — name the 3 problems small business owners recognize
    Decision served: Credibility ("They understand my problem")
    No CTA here — this is an emotional resonance moment, not a conversion pressure point

Section 4: HOW IT WORKS
    Purpose: 3-step process removes fear of complexity
    Decision served: Effort evaluation ("Can I actually use this?")
    Secondary CTA: "Try it now" after step 3

Section 5: CORE FEATURES (Three-Layer System)
    Purpose: Explain the Director/Scriptwriter/Packaging layers in outcome language
    Decision served: Credibility ("This is more sophisticated than other tools")
    Each layer: icon + plain-language name + one-sentence outcome

Section 6: DIFFERENTIATORS / SOCIAL PROOF
    Purpose: Real output samples + user quotes + usage stats
    Decision served: Credibility ("Other people like me are using this")
    Combine sample video/screenshot + 2-3 testimonial quotes + stat row

Section 7: FINAL CTA (footer-adjacent)
    Purpose: Last conversion opportunity for scrollers who didn't convert in hero
    Decision served: Commitment ("Should I start now?")
    Stronger language: "Create your first video free — no skills needed"
    Reduce friction cue below button: "No credit card required · Takes 5 minutes"

Section 8: FOOTER
    Purpose: Completeness signal, company info, Chinese social links
    Decision served: Trust ("This is a legitimate company")
    Content: Logo, links, WeChat QR (if available), contact email
```

---

## Feature Dependencies

```
[Language Switcher]
    └──requires──> [next-intl locale configuration]
                       └──requires──> [Translation JSON files (zh-CN + en)]
                                          └──covers──> [All 7 sections + navbar + footer]

[Sample Output Video / Screenshot]
    └──requires──> [Real Shanjian render — ZERO MOCK RULE applies]
                       └──if unavailable──> [Animated screenshot sequence as fallback]

[Social Proof Section]
    └──requires──> [Real user testimonials or quantified usage stats]
                       └──if no real users yet──> [Founder-as-user testimonial acceptable
                                                   as placeholder only until real users available]

[Pain Points Section]
    └──enhances──> [Hero conversion rate]
    (Naming the pain before offering the solution primes the CTA)

[WeChat QR Code in Footer]
    └──requires──> [Active WeChat official account]
    └──conflicts──> [Adding to footer if account is not actively maintained]
```

### Dependency Notes

- **Translation JSON files must cover all sections before any section is built:** Hardcoding Chinese
  text strings directly in components makes i18n impossible to maintain. All copy must go through the
  translation system from day one, even if only zh-CN is complete at first.

- **Sample output must be real, not mock:** The Zero Mock Rule explicitly prohibits placeholder renders.
  If a real video cannot be embedded, use a real screenshot sequence from a completed Shanjian render.
  A fake or stock video undermines the entire credibility case.

- **Social proof with no real users:** If the product has zero real users at launch, the section must
  use an honest alternative: "Created by small business owners, for small business owners" + founder
  story, OR defer to usage stats (even if small: "10 businesses have tried it"). Never fabricate
  testimonials or user counts.

---

## MVP Definition

### Launch With (v1 — this milestone)

- [ ] **Navbar** — logo, language switcher (zh-CN/EN), "Start Free" CTA button — why essential: every
      page entry point, establishes brand identity

- [ ] **Hero section** — outcome-focused headline + subheadline + primary CTA — why essential: first
      conversion gate; if this fails nothing else matters

- [ ] **Pain Points section** — 3 small business video pain points in empathy language — why essential:
      converts skeptics who think "another AI tool"; must resonate before asking for signup

- [ ] **How It Works section** — 3-step process with plain-language step names — why essential: reduces
      perceived complexity; the single biggest objection ("this will be too hard") is addressed here

- [ ] **Core Features section** — three layers explained as outcomes (not architecture) + 2 differentiators
      (IP personalization + hot topics) — why essential: establishes superiority vs generic AI tools

- [ ] **Social Proof section** — minimum one real testimonial or usage stat + real output sample —
      why essential: no social proof = no conversion for skeptical audience

- [ ] **Final CTA section** — repeated offer with friction-reducing copy — why essential: captures
      late-scroll converters who needed full context

- [ ] **Footer** — company info, contact, links — why essential: trust completeness signal; Chinese
      audience specifically checks for this

- [ ] **Bilingual JSON translations** — zh-CN (primary) + en (secondary) for all copy — why essential:
      internationalization cannot be retrofitted; must be built in from start

- [ ] **Mobile-first responsive** — 375px → 1440px — why essential: majority of Chinese small business
      owner traffic is mobile

### Add After Validation (v1.x)

- [ ] **WeChat QR code** — add when official account is established and actively managed

- [ ] **FAQ section** — add when support questions start repeating; build FAQ content from real user
      objections, not hypothetical ones. Place above final CTA.

- [ ] **Pricing page** — add as separate route `/pricing` once pricing tiers are finalized; link from
      navbar

- [ ] **Video demo embed** — add when a production-quality Shanjian render is available and approved
      for public use; 30-60 second format, muted autoplay

- [ ] **A/B test hero headline variants** — add once sufficient traffic (500+ monthly visitors) to
      generate statistically meaningful results

### Future Consideration (v2+)

- [ ] **Interactive product tour** — clickable walk-through of the three-layer creation flow; high
      implementation cost, meaningful only after product is stable

- [ ] **Case studies page** — long-form customer stories with quantified results; requires real customers
      with measurable outcomes

- [ ] **Blog / content hub** — separate route, SEO investment; defer until product-market fit is
      established and there is editorial capacity

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Hero section | HIGH — first conversion gate | LOW — static content + CTA | P1 |
| How It Works (3-step) | HIGH — removes fear of complexity | LOW — icons + copy | P1 |
| Bilingual i18n (next-intl) | HIGH — zh-CN audience is primary | MEDIUM — JSON files + locale middleware | P1 |
| Mobile-first responsive | HIGH — majority of traffic | MEDIUM — Tailwind breakpoints throughout | P1 |
| Pain Points section | HIGH — emotional resonance converts skeptics | LOW — copy + layout | P1 |
| Social Proof section | HIGH — trust gate | MEDIUM — need real content, not templates | P1 |
| Final CTA section | MEDIUM — captures late converters | LOW — copy + button | P1 |
| Core Features section | MEDIUM — establishes differentiation | LOW — icon cards | P1 |
| Footer | MEDIUM — trust completeness | LOW — links + copy | P1 |
| Language switcher | MEDIUM — secondary EN audience | LOW — next-intl cookie toggle | P1 |
| FAQ section | MEDIUM — reduces support burden | LOW — once real questions exist | P2 |
| WeChat QR | LOW at launch (depends on account) | LOW | P2 |
| Pricing page | MEDIUM — reduces "how much?" questions | LOW — separate route | P2 |
| Video demo embed | HIGH IF available — 86% conversion lift | MEDIUM — hosting + embed | P2 |
| Interactive product tour | HIGH but risky | HIGH — JS, maintenance burden | P3 |
| Case studies page | HIGH for late-funnel | HIGH — requires real customers | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Add when trigger condition is met (see Add After Validation)
- P3: Future milestone, product-market fit required first

---

## Competitor Feature Analysis

Analysis based on HeyGen, Pictory, and InVideo landing pages as the primary AI video tool comparators.

| Feature | HeyGen | Pictory | InVideo | ClipFlow Approach |
|---------|--------|---------|---------|-------------------|
| Hero value prop focus | Avatar-based video creation | Text-to-video speed | Templates + AI editing | Personal IP for small business owners (niche, not general) |
| "How it works" section | 3-step visual process | 3-step visual process | Template-first demo | 3-step: business profile → AI layers → video output |
| Social proof type | Logo parade + testimonials | User count + testimonials | "Join X creators" | Real output samples + user quotes (authenticity over volume) |
| Pain point acknowledgment | Implicit (slow video production) | Explicit (editing is hard) | Implicit | Explicit: no skills, generic AI, personal IP complexity |
| Pricing on landing page | Yes (prominent) | Yes | Yes | No — drive to signup first, pricing on separate route |
| Bilingual support | EN only (separate global site) | EN only | EN primary | zh-CN primary, EN secondary, cookie-based toggle |
| Mobile experience | Responsive | Responsive | Responsive | Mobile-first (375px base) |
| CTA copy | "Get started free" | "Start for free" | "Get started free" | "免费开始" (zh-CN primary) / "Start Free" (EN) |

**Key differentiation opportunity:** No major competitor targets the "personal IP for Chinese small
business owners" niche with a bilingual-first page. HeyGen/Pictory/InVideo are English-first, general-
purpose tools. ClipFlow's landing page should lean into the specific audience and specific pain (building
personal IP on Douyin/WeChat video channels) rather than competing on general feature count.

---

## i18n Implementation Notes

### Library Recommendation: next-intl
- Use `localePrefix: 'never'` configuration to avoid URL-prefixed routes (`/zh/`, `/en/`)
- Locale stored in `NEXT_LOCALE` cookie — persists across sessions
- `NextIntlClientProvider` wraps layout root for Client Component access
- Translation files: `/messages/zh-CN.json` and `/messages/en.json`
- Language switcher: updates cookie + calls `router.refresh()` — no page reload needed

### zh-CN Copy Guidelines
- Headlines in zh-CN should be shorter than English equivalents (Chinese is information-dense)
- Avoid directly translating English idioms — localize the meaning, not the words
- Pain point copy must use vocabulary familiar to Chinese small business owners (小店主, 个人IP, 短视频)
- CTA buttons: "免费开始" not "开始免费试用" — brevity converts better on mobile

### Chinese Market Infrastructure Notes
- Do not embed YouTube videos — blocked in mainland China. Use Alibaba Cloud OSS-hosted video or Youku.
- Do not link to Instagram, Twitter, Facebook — these load slowly or fail entirely from mainland China.
- Server is already on Alibaba Cloud (Kubernetes) — load time from China is acceptable.
- Remove any third-party scripts from blocked Western CDNs that would slow page load in China.

---

## Sources

- SaaS landing page section structure (2026 best practices): https://fibr.ai/landing-page/saas-landing-pages
- B2B SaaS landing page components: https://genesysgrowth.com/blog/components-b2b-saas-landing-pages
- Social proof patterns for landing pages: https://www.mailerlite.com/blog/social-proof-examples-for-landing-pages
- Testimonial types and placement: https://testimonial.to/resources/social-proof-examples
- CTA placement strategies (2026): https://www.landingpageflow.com/post/best-cta-placement-strategies-for-landing-pages
- FAQ as objection handling: https://www.cortes.design/post/design-landing-pages-around-objections
- Chinese landing page checklist: https://en.istarto.com/12-point-checklist-for-building-your-chinese-landing-page/
- next-intl App Router docs: https://next-intl.dev/docs/getting-started/app-router
- next-intl routing configuration (localePrefix: never): https://next-intl.dev/docs/routing/configuration
- Cookie-based locale switching (next-intl discussion): https://github.com/amannn/next-intl/discussions/1135
- Video on landing pages conversion rate: https://www.involve.me/blog/video-landing-pages
- SaaS landing page conversion system (2026): https://unicornplatform.com/blog/saas-landing-page-conversion-system-in-2026/
- "How it works" 3-step pattern analysis: https://www.cortes.design/post/saas-landing-page-breakdown-example

---

*Feature research for: Bilingual SaaS landing page — ClipFlow v2.0 Official Website*
*Researched: 2026-03-26*
