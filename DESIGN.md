# Explores.Berlin — Style Reference
> Neo-brutalist arcade console over warm cream — a Berlin city guide where pixel type, hard offset shadows and neon accents meet structured cream-toned UI surfaces.

**Theme:** mixed

Explores.Berlin feels like a playable city console — warm cream canvas framed by 2px black borders and 4px offset hard shadows, while a near-black fixed nav with rose accents brackets the top. The layout is an app shell (not a landing page): filter toolbar and scrollable listing grid left, live map right. Goldman is the default face for body and headings — geometric, techy, slightly condensed; Press Start 2P ("pixel") fires only for arcade labels and the marquee ticker; ui-monospace handles buttons and micro-labels. Rose (#f43f5e) is the primary action accent (nav CTA, active states, logo mark); neon lime (#39FF14) marks selection; sky (#38BDF8) marks info CTAs; price red (#b92626) marks headings and prices. Category meaning is carried by a fixed marker/badge palette (pink bar, violet restaurant, lime döner, amber beer…).

Design tokens live in `tailwind.config.ts` (`theme.extend`). Class names below are the real utilities — e.g. `bg-cream`, `text-price`, `shadow-punch`, `font-pixel`.

## Tokens — Colors

| Name | Value | Tailwind | CSS var | Role |
|------|-------|----------|---------|------|
| Cream Canvas | `#fcfaee` | `bg-cream` | `--color-cream-canvas` | Primary page background; warm toasted off-white, also `body` bg |
| Card Cream | `#fffdf4` | `bg-cream-card` | `--color-card-cream` | Card/panel fill on cream (pills, pickers) |
| Bone | `#ffffff` | `bg-bone` | `--color-bone` | Image frames, carousel buttons, text on dark surfaces |
| Ink | `#18181b` | `text-ink` | `--color-ink` | Primary text |
| Border Black | `#000000` | `border-black` (default) | `--color-border-black` | All structural borders (`border-2 border-black`) — never gray |
| Fog | `#71717a` | `text-fog` | `--color-fog` | Secondary text (counts, hints, metadata) |
| Ash | `#a1a1aa` | `text-ash` | `--color-ash` | Tertiary text on dark (nav labels, placeholders) |
| Coal 900/800 | `#18181b` / `#27272a` | `bg-coal-900/800` | `--color-coal-900/800` | Dark fills (cards/nav-active, hovers) |
| Pit | `#0a0a0a` | `bg-pit` | `--color-pit` | Deepest dark frames (map shell, image fallback, nav mobile) |
| Brand Rose | `#f43f5e` | `bg-brand` / `text-brand` | `--color-brand` | Primary action: nav CTA, logo mark, active pills (== `rose-500`; existing `rose-*` classes keep working) |
| Neon Lime | `#39FF14` | `bg-neon` | `--color-neon-lime` | Selection state: active Bezirk picker, badges |
| Signal Sky | `#38BDF8` | `bg-signal` | `--color-signal-sky` | Info CTAs and upload buttons (always with black border) |
| Deep Sky | `#0284C7` | `bg-deepsky` | `--color-deep-sky` | Selected map marker fill |
| Price Red | `#b92626` | `text-price` | `--color-price-red` | Listing/detail headings, price text |
| Ticker Red | `#dc2626` | `text-ticker` | `--color-ticker-red` | PixelTicker text |
| Ticker Shadow | `#FACC15` | `text-tickershadow` | `--color-ticker-shadow` | `3px 3px 0px` hard shadow behind ticker text |
| Royal | `#9333ea` | `border-royal` / `text-royal` | `--color-royal` | Selected card border + "Selected" tag |
| Cyber Cyan | `#4deeea` | `text-cyber` | `--color-cyber-cyan` | Neon text/border accents on dark |
| Newsletter Ember | `rose-500 → orange-500` | `bg-gradient-to-r from-rose-500 to-orange-500` | `--gradient-newsletter-ember` | Newsletter band + subscribe CTA |

### Category Marker Palette (Map.tsx / ListingCard badges)

| Category | Marker (`bg-marker-*`) | Badge (light) |
|------|------------------------|---------------|
| default | `#6B7280` | zinc |
| Bar | `#EC4899` | pink-100 / pink-700 |
| Restaurant | `#8B5CF6` | orange-100 / orange-700 |
| Café | `#06B6D4` | cyan-100 / cyan-700 |
| Beer | `#F59E0B` | lime-100 / lime-700 |
| Event | `#EF4444` | blue-100 / blue-700 |
| Döner | `#84CC16` | (orange restaurant family) |
| Club/Night | `#D946EF` | indigo-100 / indigo-700 |

## Tokens — Typography

### Goldman — default face for body, headings, UI labels (`font-goldman`)
Geometric techno-grotesk; 700 for headings/prices, 400 for body. Uppercase + tight tracking for titles.
- **Source:** `next/font/google` Goldman, weights 400/700, applied as `body` class (`app/layout.tsx`)
- **Sizes:** 10px, 12px, 14px, 16px, 18px, 20px, 24px
- **Line height:** 1.0–1.5 (none/tight at titles, 1.5 at body)
- **Letter spacing:** `tracking-tight` at titles, `tracking-widest/wider` at uppercase labels

### Press Start 2P — pixel accent face, weight 400 only (`font-pixel`). NEVER body text.
- **Source:** `next/font/google` Press_Start_2P, `variable: --font-pixel` (`app/layout.tsx`)
- **Sizes:** 16–18px (ticker `text-base/md:text-lg`)
- **Role:** arcade labels + PixelTicker marquee (uppercase, red, yellow hard shadow)

### Mono — ui-monospace stack (`font-mono`). Buttons, logo mark, micro-interactions.

> Not: `Inter` layout'ta import ediliyor ama kullanılmıyor — yeni işlerde kullanma.

### Type Scale

| Role | Size | Line Height | Letter Spacing |
|------|------|-------------|----------------|
| micro-label | 10px | 1.0 | +0.2em (nav eyebrow) / tight (tooltips) |
| caption | 12px | 1.5 | widest (section labels: "Menu") |
| body-sm | 14px | 1.5 | — |
| body | 16px | 1.5 | — |
| card-title | 18px | tight | tight |
| heading | 24px | tight | tight, uppercase, `text-price` |
| ticker | 16–18px | none | widest, uppercase |

## Tokens — Spacing & Shapes

**Base unit:** 4px (`p-4/p-6` grid padding, `gap-3/4`) · **Density:** comfortable

### Border Radius

| Element | Value |
|---------|-------|
| listing cards, map shell | 0px (`rounded-none`) — sharp brutalist edges |
| listing images | 12px (`rounded-xl`) |
| pills, carousel arrows, avatars | 999px |
| logo cube | 2px (`rounded-sm`) |
| brutalist buttons | 0px (border-2 + hard shadow, no radius) |

### Shadows (`boxShadow` tokens — elevation = offset hard shadows, never blur)

| Name | Value | Class | Usage |
|------|-------|-------|-------|
| punch | `4px 4px 0px 0px rgba(0,0,0,1)` | `shadow-punch` | pickers, cards, map shell, CTA buttons |
| punch-sm | `2px 2px 0px 0px rgba(255,255,255,0.2)` | `shadow-punch-sm` | nav logo + CTA on black |
| punch-royal | `2px 2px 0px 0px rgba(147,51,234,0.5)` | `shadow-punch-royal` | "Selected" tag |
| press | `translate(2px,2px)` + `shadow-none` | (`active:` variants) | `:active` state on all brutalist buttons |

### Layout

- **Shell:** `h-screen flex-col` app, `pt-16` under fixed nav; content split left grid (`lg:w-3/5`) / right map
- **Grid padding:** `p-4 sm:p-6 pb-32`, hidden scrollbars (`.no-scrollbar`)
- **Detail panel:** bottom `h-[30%]` sheet with menu table first, hours second

## Components

### Primary Navigation (`components/Navigation.tsx`)
**Role:** Fixed top bar. `bg-black/95 backdrop-blur-md border-b border-zinc-800/50`. White wordmark + `text-brand` eyebrow (`text-[10px] tracking-[0.2em] uppercase`); `bg-brand` logo cube (black pixel glyph, mono). Links uppercase mono, `text-ash → white`. CTA: `bg-brand text-black border-2 border-brand font-mono` → hover inverts to black bg / brand text; press effect on active.

### Filter Pills / Bezirk Picker (`app/page.tsx`)
**Role:** Category + district filtering. `border-2 border-black px-4 py-2 shadow-punch bg-cream-card`; **active = `bg-neon`**. Uppercase Goldman. Categories: Beer / Cocktail / Döner.

### ListingCard (`components/ListingCard.tsx`)
**Role:** Sharp (`rounded-none`) listing row, `border-2 transparent → hover:border-black`, `p-3`. 4:3 image (`rounded-xl`, hover scale-105, carousel arrows on hover). Title 18px semibold `text-price`; category badge from pastel badge system; selected state = `border-royal` + floating "Selected" tag (`shadow-punch-royal`). Price line: `from X,XX €` in amber-600.

### PixelTicker (`components/PixelTicker.tsx`)
**Role:** Arcade marquee strip. `font-pixel text-base md:text-lg text-ticker uppercase tracking-widest leading-none` + `text-shadow: 3px 3px 0px #FACC15`; 30s linear infinite slide (`pixel-slide` in `globals.css`).

### Detail Panel + Menu Table (`app/page.tsx`, `lib/menu.ts`)
**Role:** Bottom sheet for selected place. Title 24px uppercase `text-price`; `Menu` label 12px widest + amber `from X,XX €`; table `text-xs`, `border-b border-black/20` header (Item left / Price right). Rows from `parseMenuMd(menu_md)`; `lowestDonerPrice()` feeds the card line.

### Newsletter Band + CTA (`app/newsletter/page.tsx`, `app/subscribe/page.tsx`)
**Role:** Ember gradient band (`from-rose-600 to-orange-500`), CTA `from-rose-500 to-orange-500 text-white font-bold uppercase`, hover opacity-90.

### Map Markers (`components/Map.tsx`)
**Role:** Category-colored pins from `marker.*` palette; selected pin flips to signal sky (stroke deepsky) or royal; tooltip `text-[10px] font-bold uppercase` white-on-dark with white hard shadow.

## Do's and Don'ts

### Do
- Use `bg-cream` canvas + `bg-cream-card` cards; structural borders are always `border-2 border-black` with `shadow-punch`.
- Set Goldman 700 uppercase + tight tracking for all headings; prices always `text-price`.
- Reserve `bg-neon` for selection/active states only — never body text or decoration.
- Use `bg-brand` for primary actions, `bg-signal` (+black border) for info/upload CTAs.
- Pixel face only for ticker/labels at 16–18px, always uppercase; mono for buttons.
- Press effect (`active:translate + shadow-none`) on every brutalist button.
- Category color must come from the `marker.*` palette — same hue in map pin and card badge.

### Don't
- Don't use blurred drop shadows — elevation is offset hard shadows only.
- Don't round listing cards or buttons (sharp 0px); radius lives only on images (12px) and pills (999px).
- Don't use Inter for new work (dead import); don't add new typefaces — Goldman/pixel/mono cover all roles.
- Don't use brand rose as body text or neon lime outside selection states.
- Don't show prices in zinc/gray — price is always `text-price` (headings) or amber `from X €` (card line).
- Don't invent new category colors — map pin and badge must match the palette table.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Pit frame | `bg-pit` + `bg-black/95` nav | Fixed nav, map shell surround, mobile menu |
| 1 | Cream canvas | `bg-cream` | Page + grid background |
| 2 | Card cream / bone | `bg-cream-card` / `bg-bone` | Pickers, cards, image frames |
| 3 | Coal | `bg-coal-900/800` | Dark fills, hovers, tooltip chips |

## Imagery

Place photography is the hero — 4:3 `rounded-xl` frames with hover zoom; missing photos fall back to a violet→pink gradient tile with lucide glyph + subtype pixel label. Newsletter uses neon illustrated headers. Ticker is pure type-as-image (pixel + hard shadow). No lifestyle hero photography; the map itself is the visual anchor. Icons are lucide outline (~16–20px), monochrome.

## Layout

App shell, not landing: fixed nav (64px) → toolbar → 60/40 grid/map split, detail bottom-sheet on selection. Max fluid width (no 1200px container). Spacious 16–24px gaps, `pb-32` scroll clearance. Motion is functional: 200–500ms transitions, carousel scale-105, marquee 30s linear, press-down actives.

## Agent Prompt Guide

**Quick Color Reference**
- text: `text-ink` (#18181b) · muted: `text-fog`
- background: `bg-cream` · card: `bg-cream-card`
- border: `border-2 border-black` + `shadow-punch`
- primary action: `bg-brand` · selection: `bg-neon` · info CTA: `bg-signal`
- price/headings: `text-price` · ticker: `text-ticker` + `#FACC15` shadow
- dark frame: `bg-pit` / `bg-coal-900`

**Example Component Prompts**

1. Filter Pill: `border-2 border-black px-4 py-2 shadow-punch bg-cream-card font-bold uppercase`; active: `bg-neon`. Goldman 14px.
2. Brutalist CTA: `px-5 py-3 border-2 border-black bg-signal text-black font-mono font-bold uppercase shadow-punch hover:bg-black hover:text-signal active:translate-x-[2px] active:translate-y-[2px] active:shadow-none`.
3. Listing Title + Price: title `text-lg font-semibold text-price`; price line `text-amber-600` "from X,XX €".
4. Pixel Ticker: `font-pixel text-base md:text-lg text-ticker uppercase tracking-widest leading-none` + `text-shadow: 3px 3px 0px #FACC15`, wrapper `animate-pixel-slide whitespace-nowrap`.
5. Map Pin (döner): fill `bg-marker-doner`, selected → fill `bg-signal` stroke `bg-deepsky`; tooltip `text-[10px] font-bold uppercase`.

## Token → Class Cheatsheet

| CSS var | Tailwind class | Value |
|---------|---------------|-------|
| `--color-cream-canvas` | `bg-cream` | #fcfaee |
| `--color-card-cream` | `bg-cream-card` | #fffdf4 |
| `--color-ink` | `text-ink` | #18181b |
| `--color-brand` | `bg-brand` / `text-brand` | #f43f5e (== rose-500) |
| `--color-neon-lime` | `bg-neon` | #39FF14 |
| `--color-signal-sky` | `bg-signal` | #38BDF8 |
| `--color-price-red` | `text-price` | #b92626 |
| `--color-royal` | `border-royal` | #9333ea |
| `--color-marker-*` | `bg-marker-*` | palette table |
| `--font-goldman` | `font-goldman` | Goldman |
| `--font-pixel` | `font-pixel` | Press Start 2P |
| `--shadow-punch` | `shadow-punch` | 4px hard offset |
