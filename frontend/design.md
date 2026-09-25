# Design: AXEL

Source of truth for the frontend's look. Code that disagrees with this file is a bug, except for
the legacy aliases listed under "Constraints". Written with the design-lab pipeline (redesign
mode, levels 1–3). Tokens live in `src/styles/globals.css` and are mapped in `tailwind.config.ts`.

## Inputs

**Niche.** Real-world-asset investing: fractional, tokenized shares in taxi cars that work in
Almaty, Kazakhstan, settled on Solana. Each car is a separate project. Investors buy shares and
claim a pro-rata part of the car's revenue.

**Audience.** Two groups read the same screens:

- Retail investors in Kazakhstan. They use Kaspi, Halyk and Freedom apps daily, read Russian or
  Kazakh first, mostly on phones, and know little about crypto. They need to see who runs the
  car, where the money goes and what they can check themselves.
- Crypto-native judges at Colosseum Crypto World's Fair. They scan on desktop, look for real
  on-chain mechanics and polish, and have seen every neon DeFi dashboard already.

**Character:** calm, trustworthy, precise, local, grounded, transparent, premium.

**Style.** Editorial fintech. A serif display face for headlines over a precise sans for
everything else. Real photography of Almaty (night, dusk, film grain, slightly desaturated) on
dark ink surfaces. Light paper surfaces for the working app. Data is dense but airy: tabular
numbers, ledgers, thin rules. Photos are real, never 3D renders or AI images. No decorative
gradients, glass or glow.

**Boldness:** middle. The structure and components follow fintech and RWA conventions (stat row,
asset cards with yield and progress, numbered steps, ledgers). One distinctive move carries the
brand: serif headlines over Almaty night photography, plus the token-crossbar mark.

**References** (captured 2026-09-25):

| Reference                                  | What we take                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [Masterworks](https://www.masterworks.com) | Serif headline with a sober sans; numbered "how it works" steps; proof told in numbers ("less than 3% pass our diligence")      |
| [Lofty](https://www.lofty.ai)              | Asset card anatomy: photo, price per share, yield, funding progress, holder count; three key stats under the hero               |
| [Arrived](https://arrived.com)             | Large stats row (total invested, distributed to investors); yield per asset as the headline metric                              |
| [Mercury](https://mercury.com)             | Calm premium tone; an atmospheric photo as the hero with text in a controlled zone; the legal note placed plainly near the fold |
| [Ondo Finance](https://ondo.finance)       | Crypto-native RWA shown through a real city photo, not neon; an ecosystem proof strip                                           |

Anti-reference: [Freedom Finance KZ](https://ffin.kz). It is the local broker our audience sees
daily. We take only its conventions (language switch top right, "Open account" as the single
primary action). We avoid its gradient text and 3D logo renders.

## Theme (tokens)

Token names follow the design-lab contract (`components/TOKENS.md`, shadcn names). Colors are
stored as OKLCH channels, e.g. `--primary: var(--cyan-700)` and used as
`oklch(var(--primary) / <alpha-value>)`. Components use **semantic tokens only**. The `ink` and
`cyan` primitives exist to build them.

### Primitives

Ink: cool neutrals tinted with the brand hue (215). Chroma rises toward the dark end.

| Step  | OKLCH            | Hex     | Typical role                               |
| ----- | ---------------- | ------- | ------------------------------------------ |
| paper | 0.995 0.0015 215 | #FCFEFE | Cards on light pages                       |
| 25    | 0.985 0.003 215  | #F8FBFB | Page background; text on ink               |
| 50    | 0.97 0.005 215   | #F2F6F7 | Muted panels, alternating sections         |
| 100   | 0.945 0.007 216  | #E8EEF0 | Secondary buttons, hover fills             |
| 200   | 0.91 0.009 217   | #DBE3E5 | Borders                                    |
| 300   | 0.86 0.011 218   | #C9D3D6 | Strong dividers                            |
| 400   | 0.72 0.014 220   | #9CA7AB | Muted text on ink                          |
| 500   | 0.555 0.016 222  | #69757A | Subtle text, placeholders (4.56:1 on page) |
| 600   | 0.49 0.018 224   | #566368 | Muted text (5.97:1 on page)                |
| 700   | 0.39 0.02 226    | #3A474D |                                            |
| 800   | 0.29 0.02 228    | #212D33 | Borders on ink                             |
| 900   | 0.215 0.018 230  | #111B20 | Text; cards on ink                         |
| 950   | 0.165 0.015 232  | #081014 | Ink background (hero, footer)              |

Cyan: the brand hue. 500 is the logo cyan and never carries text on light surfaces.

| Step | OKLCH               | Hex     | Typical role                      |
| ---- | ------------------- | ------- | --------------------------------- |
| 50   | 0.975 0.02 205      | #E8FBFD | Accent fill (selected row, info)  |
| 100  | 0.945 0.045 207     | #CBF6FC |                                   |
| 200  | 0.9 0.075 209       | #A2ECF9 | Accent text on ink                |
| 300  | 0.84 0.105 211      | #6EDDF1 | Primary hover on ink              |
| 400  | 0.78 0.125 213      | #36CCE7 | Primary on ink                    |
| 500  | 0.7148 0.1257 215.2 | #06B6D4 | Logo token, signal dots on ink    |
| 600  | 0.61 0.11 218       | #0092AF | Focus ring                        |
| 700  | 0.51 0.092 221      | #06718B | Primary action and links on light |
| 800  | 0.43 0.078 223      | #06596F | Primary hover on light            |
| 900  | 0.35 0.062 225      | #084153 | Accent text on light              |
| 950  | 0.27 0.048 227      | #052B39 | Accent fill on ink                |

Status: green 50 #E3FAED / 400 #54CC8E / 700 #136842; amber 50 #FEF4DF / 400 #F2AF48 /
700 #884D10; red 50 #FEF0EE / 400 #F66D67 / 600 #C1332F. Red is kept for errors only and never
used as a brand color.

### Semantic tokens

| Token                                      | Light page                   | Ink surface (`.theme-ink`)    |
| ------------------------------------------ | ---------------------------- | ----------------------------- |
| `--background` / `--foreground`            | ink-25 / ink-900             | ink-950 / ink-25              |
| `--card` / `--card-foreground`             | paper / ink-900              | ink-900 / ink-25              |
| `--popover`                                | paper                        | ink-900                       |
| `--primary` / `-hover` / `-foreground`     | cyan-700 / cyan-800 / ink-25 | cyan-400 / cyan-300 / ink-950 |
| `--secondary` / `-foreground`              | ink-100 / ink-900            | ink-800 / ink-25              |
| `--muted` / `--muted-foreground`           | ink-50 / ink-600             | ink-900 / ink-400             |
| `--subtle-foreground`                      | ink-500                      | ink-400                       |
| `--accent` / `-foreground`                 | cyan-50 / cyan-900           | cyan-950 / cyan-200           |
| `--destructive` / `-muted` / `-foreground` | red-600 / red-50 / ink-25    | red-400 / ink-800 / ink-950   |
| `--success` / `-muted`                     | green-700 / green-50         | green-400 / ink-800           |
| `--warning` / `-muted`                     | amber-700 / amber-50         | amber-400 / ink-800           |
| `--brand`                                  | cyan-500                     | cyan-500                      |
| `--border`                                 | ink-200                      | ink-800                       |
| `--input`                                  | 0.64 0.015 221 (#838E93)     | ink-500                       |
| `--ring`                                   | cyan-600                     | cyan-400                      |

`.theme-ink` rebinds the same names, so any component placed in a dark section adapts without
extra classes. This is a dark surface for chosen sections, not a dark mode.

Contrast, checked with the WCAG formula on the real pairs:

| Pair                                                | Ratio       |
| --------------------------------------------------- | ----------- |
| foreground on background                            | 16.8        |
| muted-foreground on background / on muted           | 5.97 / 5.71 |
| subtle-foreground on background                     | 4.56        |
| primary-foreground on primary; primary as link text | 5.39        |
| success on background / on success-muted            | 6.54 / 6.21 |
| warning on background                               | 6.48        |
| destructive on background                           | 5.34        |
| input border on background (non-text, needs 3:1)    | 3.23        |
| ring on background (non-text)                       | 3.52        |
| ink: foreground on background                       | 18.4        |
| ink: muted-foreground on background / on card       | 7.79 / 7.10 |
| ink: primary-foreground on primary                  | 10.0        |
| ink: success on card / destructive on card          | 8.66 / 6.08 |

### Typography

| Role                     | Family                                       | File                                                           | Use                                          |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------- |
| Heading (`font-heading`) | Axel Serif (Source Serif 4, optical size 40) | `src/fonts/AxelSerif-Variable.woff2`, 72 KB                    | `display`, `h1`, `h2`, `h3` only, weight 500 |
| Body (`font-sans`)       | Onest                                        | `src/fonts/Onest-Variable.woff2`, 39 KB                        | All UI, text, `h4` and below, numbers        |
| Code (`font-mono`)       | JetBrains Mono                               | `src/fonts/JetBrainsMono-Variable.woff2`, 28 KB, not preloaded | Addresses, hashes, mints. Latin only         |

All three are self-hosted with `next/font/local`, so the build never calls Google Fonts. Both
text faces cover Kazakh (Ә Ғ Қ Ң Ө Ұ Ү Һ І) and ₸. Manrope and JetBrains Mono were checked and
lack Kazakh glyphs, so Manrope is out and mono never carries prose.

Scale: 16 px base, ratio 1.25 (`--type-ratio`), rounded to the 4 px grid.

| Class           | Size / line-height | Tracking | Family, weight                      |
| --------------- | ------------------ | -------- | ----------------------------------- |
| `text-display`  | 64 / 1.05          | −0.025em | heading 500. Hero only, desktop     |
| `text-h1`       | 48 / 1.08          | −0.02em  | heading 500                         |
| `text-h2`       | 40 / 1.1           | −0.02em  | heading 500                         |
| `text-h3`       | 32 / 1.15          | −0.015em | heading 500                         |
| `text-h4`       | 24 / 1.25          | −0.01em  | sans 600                            |
| `text-title`    | 20 / 1.4           | −0.005em | sans 600. Card titles               |
| `text-lead`     | 18 / 1.55          | 0        | sans 400. Hero and section intros   |
| `text-body`     | 16 / 1.5           | 0        | sans 400                            |
| `text-small`    | 14 / 1.43          | 0        | sans 400/500. Tables, meta          |
| `text-caption`  | 12 / 1.33          | +0.01em  | sans 500. Photo notes, legal        |
| `text-overline` | 12 / 1.33          | +0.08em  | sans 600, uppercase. Section labels |

Rules: at most three sizes per screen region; body text never below 16 px, inputs never below
16 px (iOS zoom). Money, percentages, dates and counters use `tabular-nums`. Text columns are
capped at 65ch.

Numbers are formatted with `Intl.NumberFormat` in the `ru-KZ` / `kk-KZ` / `en` locale with the
narrow currency symbol, so Russian and Kazakh read "1 250 000 ₸" and English reads "₸1,250,000".
v1 devnet data is in SOL; v2 moves prices to the tenge stablecoin (tKZT on devnet).

### Spacing, layout, radii, elevation

- Spacing: Tailwind's 4 px scale, restricted to 4, 8, 12, 16, 24, 32, 48, 64, 96. Roles: 4 icon
  to label, 8 inside a control, 16–24 card padding, 24 between blocks, 32–48 between groups,
  56 (mobile) / 96 (desktop) between sections (`.section-y`, `--section-py`).
- Container: `.page-container`, 1200 px content (`--container-max`) with 24 px gutters, 32 px
  from `lg`. One left edge for the whole page.
- Grid: vehicle cards 1 column below 640, 2 from `sm`, 3 from `lg`.
- Radii (`--radius` = 12 px): `rounded-control` 8 for buttons and inputs, `rounded-card` 12,
  `rounded-panel` 16 for modals and large panels, `rounded-pill` only for status badges and
  segmented filters. Buttons are not pills: this is money, not a consumer toy.
- Elevation: `shadow-xs`…`shadow-lg`, two layers cast downward and tinted with ink. Cards sit on
  a border plus `shadow-sm`; hover lifts to `shadow-md`. On ink, elevation is a lighter
  surface (ink-900 over ink-950), not a shadow.

### Icons

`lucide-react` only. Sizes 16 (inline, tables), 20 (controls), 24 (navigation). One stroke width,
1.75, everywhere. Color through `currentColor`. Icons next to text are `aria-hidden`; icon-only
buttons carry an `aria-label` and a 44×44 hit area.

### Motion

| Token             | Value                           | Use                                      |
| ----------------- | ------------------------------- | ---------------------------------------- |
| `--duration-fast` | 150 ms                          | Hover, press, toggles                    |
| `--duration-base` | 240 ms                          | Dropdowns, toasts, tabs                  |
| `--duration-slow` | 400 ms                          | Modals, load reveal                      |
| `--ease-out`      | cubic-bezier(0.16, 1, 0.3, 1)   | Things entering                          |
| `--ease-in`       | cubic-bezier(0.3, 0, 0.8, 0.15) | Things leaving (make exits ~30% shorter) |
| `--ease-move`     | cubic-bezier(0.2, 0, 0, 1)      | Position and color changes, hover        |

- Animate only `transform` and `opacity`. No `transition: all`.
- Reveal is CSS only: add the `reveal` class to at most 2–4 hero blocks. The keyframes run only
  while `<html data-reveal>` is set by the inline gate in `app/[locale]/layout.tsx`, which sets
  it only when `document.visibilityState === 'visible'` and clears it after 1.5 s. Without the
  flag, content is plainly visible. This avoids the framer-motion `useInView` bug that leaves
  content at opacity 0 in WKWebView. No scroll-triggered animation, no framer-motion reveals.
- No count-up tickers on money: financial numbers appear exact and static.
- Linear easing only for the skeleton shimmer. `prefers-reduced-motion` turns reveals off.

### Mobile rules

- Breakpoints: Tailwind defaults (sm 640, md 768, lg 1024, xl 1280), `min-width` only.
- Type steps down one level below `md`: hero `text-h2` (40) instead of `text-display`, section
  headings `text-h3` (32) instead of `text-h2`.
- Sections: 56 px vertical padding, 24 px gutters.
- Hero: art-directed photo, `hero/almaty-night-traffic-portrait.webp` below `md`.
- Tables become stacked rows of label and value (the holdings table already does this).
- The invest action on the asset page becomes a sticky bottom bar with a 48 px button.
- Tap targets are at least 44×44 with 8 px between them.

## Structure

Outline for the page stages that follow. Every number shown must come from the chain or be a
product rule, never a placeholder.

- **Home (catalog):** nav on ink over the hero, paper after scroll → hero (`.theme-ink`, night
  photo, serif value proposition, one primary action "Browse vehicles", a text link to how
  payouts work, stat row read from the chain) → vehicle grid with status filter → how it works in
  three numbered steps (buy a share → the car works in Almaty → claim payouts on-chain) →
  on-chain proof panel on ink (recent payouts with explorer links; Proof of solvency once v2
  lands) → risk and devnet disclosure → footer on ink.
- **Asset page:** photo with the illustrative note, title, status → sticky invest panel on the
  right (bottom bar on mobile) → funding progress and terms → payout history → telemetry.
- **Dashboard:** portfolio summary tiles (equal tiles are fine on dashboards) → holdings → claim.
- **Payouts:** ledger table with explorer links.
- **Admin:** operator console on paper with an ink header, the same tokens as the app.

## Decisions

1. **Serif for display, Onest for everything else.** Serif only at 32 px and up, weight 500.
   Why: an editorial serif reads as a trusted financial brand and breaks the "Inter plus neon"
   crypto default; Onest has Kazakh glyphs, tabular numbers and a calm grotesque voice.
   ← typography "Pairs of fonts", trends "Kinetic typography and expressive display serifs",
   anti-slop "AI-slop signature".
2. **Deep cyan for action, brand cyan for the mark.** `#06B6D4` with white text is 2.4:1 and
   fails WCAG, so actions on light surfaces use cyan-700 (5.39:1). On ink, cyan-400 with ink
   text (10:1). One primary action per screen. ← color "CTA color", "WCAG numbers".
3. **Tinted neutrals, no #000 or #FFF.** Every gray carries the brand hue at low chroma.
   ← anti-slop "pure #000000/#FFFFFF", color "Tinted gray scale".
4. **Light app with ink sections, no theme toggle.** Hero, footer and ledger panels use
   `.theme-ink`; the working screens stay light for dense numbers. ← trends "Dark mode as a
   user expectation" (an unrequested toggle is slop).
5. **Real Almaty photography, honest car photos.** Atmosphere comes from licensed photos of
   Almaty. A car photo shows the model only, is marked "Illustrative photo", and has its plate
   blurred. A photo is labeled with a model only when its source names that model and it
   visibly matches. Cobalt, Onix and JAC J7 have no verified photo and fall back to the Almaty
   taxi scene, which is never presented as the model. Resolver:
   `src/components/catalog/vehiclePhoto.ts`. ← anti-slop "licensing traps", "stock and AI
   plastic".
6. **8 px buttons, 12 px cards.** Banking seriousness over consumer playfulness; pills only for
   status. ← layout "Radii: character through curvature".
7. **No decoration on money screens.** Invest, claim and admin forms carry zero decorative
   elements. From the mvp-lab component set we reuse only the reveal-gate pattern; border beam,
   grid and dot patterns are rejected (decor on transactional screens, Linear-clone look), and
   the number ticker is rejected (animated money). ← anti-slop "fear of empty space",
   "Linear-style dark SaaS".
8. **The mark evolves, the brand stays.** The old "A" with a separate crossbar and a cyan
   circle becomes one "A" whose crossbar is the cyan token. Legs take the surface text color;
   the token is always `--brand`. Wordmark: Onest 600, uppercase, +0.14em.
   Files: `src/components/layout/Logo.tsx`, `src/app/icon.svg`.
9. **Status is never color alone.** Status badges pair a dot with a text label; positive
   payouts carry a sign. ← color "Status is never conveyed by color alone".

## Constraints

- Presentation only. `src/hooks/` and `src/lib/solana/` belong to the v2 integration and are
  not changed by design work.
- Brand: the name AXEL, near-black and the cyan `#06B6D4` stay.
- Live data: the catalog reads two v1 devnet projects, both with test metadata (Toyota Camry
  2023, no image). The UI never shows made-up figures as real.
- Legacy aliases in `tailwind.config.ts` map the pre-redesign names onto the new tokens so
  current screens keep working: `brand.primary*`, `surface.*`, `text.*`, `border.subtle`,
  `semantic.*`, `text-display-lg`, `text-title-2`, `rounded-card-sm`, `max-w-page-wide`,
  `duration-normal`. Remove each alias when its last user migrates.
- Legacy components still use Tailwind's default palettes (`gray-*`, `red-*`, `green-*`,
  `white`) and pill buttons. They move to semantic tokens during the page stages.
- `src/app/opengraph-image.tsx` still draws the old mark and colors; update it with the layout
  stage.
- Screenshots: `Google Chrome --headless=new` clamps the window to at least 500 px on macOS, so
  a 390 px capture is really a crop of a 500 px layout. Use Playwright's
  `chrome-headless-shell` for mobile widths.

## Change log

- 2026-09-25: Theme created (stage 1: direction, tokens, fonts, photo set). Calibrated against
  design-lab `knowledge/trends.md`, full update 2026-07.
