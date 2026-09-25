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
| `text-caption`  | 12 / 1.33          | +0.01em  | sans 500. Unused: see decision 12   |
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
- Grid: vehicle cards 1 column below 640 and 2 from `sm`. From `lg` the two-column grid sits in 8
  of 12 columns beside the section's sticky heading, so a short fleet never leaves an empty
  third column.
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

- **Shell (built, stage 2):** a 64 px bar. On the home page it sits transparent on the hero in
  the ink theme and turns into a solid paper bar after 16 px of scroll; every other page gets the
  paper bar from the start. Left: logo, then Cars · Portfolio · Payouts with a brand-cyan
  underline on the current page (`aria-current`). Right: network pill ("Solana Devnet", its dot
  shows the RPC state and any state but "connected" is spelled out), language menu (click, not
  hover; Escape and outside click close it), "Connect wallet" as an outline button, since the
  page's primary action lives in the content. Below `md` the right side is a 44 px menu button;
  the menu is a full-height panel under the bar with focus trap, Escape, scroll lock, large nav
  rows, a three-way language switch, the wallet block and the network pill. Footer on ink:
  logo and one-line tagline, "Product" and "Verify" link groups (Explorer, source, docs), then
  the copyright and a devnet line.
- **Home (catalog, built, stage 2):** hero on ink (Almaty night photo with an art-directed
  portrait crop below `md`, overline, serif H1, lead, primary "Browse the cars" plus a text link
  to how payouts work, a devnet note, then a four-figure stat row read from the chain: cars
  listed, shares sold "x of y", value of shares sold at each car's current price, payout
  periods) → the fleet: a sticky heading column (4 of 12) beside a two-column card grid (8 of
  12), with the status filter shown only once the cars differ in status → how it works: four
  numbered steps (verify once → buy shares → the car earns → claim), each of which leaves a
  record on Solana, with the Almaty taxi photo → verify on ink: four claims the code enforces
  (one token per car, verified holders only, payouts split by the program, open source) beside
  a ledger panel with the program, each car's share token and income vault as Explorer links →
  a "before you invest" panel: the devnet disclosure, four plain risks, and the page's closing
  CTA → footer. Every section has its own loading, empty and error state; one chain read feeds
  them all.
- **Asset page (built, stage 3):** breadcrumb (Cars / car name) → status badge, serif H1 with
  the year muted, VIN in mono → a 12-column grid: the model photo with its "Illustrative photo"
  caption (7 columns) and, beside it from `md`, the invest panel (5 columns; from `lg` it spans
  both rows and is sticky):
  price per share, "x of y shares sold" with a bar, shares left, the purchase button and one
  sentence saying why the button is what it is (connect, not approved, paused, closed, sold out,
  approved), then the devnet note. Below the photo: terms on Solana (a two-column ledger:
  numbers on the left, the share token, income vault, operator wallet and trip-data oracle as
  Explorer links on the right) → payout history (every period account of the car: number, date,
  paid in, shares counted, per share, record link; empty, loading, partial and error states) →
  payout calculator (the reader's shares and their own monthly assumption; results stay "—"
  until they type) → trip data (the telemetry widget, whose honest empty state says the tracker
  is not connected yet). Below `md` the purchase button moves to a fixed bottom bar with the
  price and a 48 px button; DOM order is the mobile order (photo, panel, details). The page
  keeps showing the car while it re-reads after a purchase.
- **Dashboard (built, stage 3):** page header (overline, serif H1, a lead that names the
  connected wallet) → a ruled summary card with three equal figures (value at current price,
  shares held "in N cars", not claimed yet) → holdings table (car with thumbnail, shares and
  "x% of the car", value, status; stacked rows below `sm`) → payouts list, newest first, each
  naming its car, number and date, with a status pill, the amount and a Claim button, plus
  "Claim all" (the page's one primary action) only when something is claimable. Disconnected:
  a two-part panel (why a wallet is needed + "Connect wallet", and what the page shows once
  connected). Empty: "This wallet holds no shares yet" with "Browse the cars". Loading keeps the
  summary labels with placeholder values. Error: retry.
- **Payouts (built, stage 3):** page header → the same ruled summary (claimed so far, not
  claimed yet, payouts) → a sortable ledger (payout, date, paid in, your share, your amount,
  status, record link; stacked label/value rows below `sm`). Disconnected, loading, empty and
  error states as on the dashboard; the old endless "Loading payout history…" with no wallet
  is gone.
- **Admin (built, stage 3):** an ink header naming the managed car (overline "Operator
  console", serif H1, share token link) with four figures (status, shares sold, payouts made,
  income vault) → paper cards in an 8 + 4 grid: deposit income (three amounts in SOL, the
  on-chain amount "paid out to holders", disabled with the reason when the program would refuse)
  and approved wallets on the left, car status on the right (pause or resume, and a close action
  that asks for confirmation inline before sending). Disconnected and wrong-wallet visitors stay
  on the page with an explanation instead of being redirected home.
- **Shared states:** `ui/Notice` (empty, error, not found), `wallet/ConnectWalletPanel`
  (disconnected), `ui/SummaryStats` (ruled figures with placeholders), `ui/Pill` (status dot +
  word; `Badge` maps project status onto it), `layout/PageHeader`. Modal is a paper dialog and a
  bottom sheet below `sm`; toasts sit top-right above modals; transaction progress reads
  "Approve it in your wallet → Sending to Solana → Waiting for confirmation → Confirmed on
  Solana".

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
10. **Only figures the chain returns.** The hero stats and the ledger are computed from the
    same `useProjectState` read the cards use (`src/components/catalog/catalogStats.ts`).
    While the read is running they show placeholders, never zeros; on failure they say so and
    offer a retry. "Raised" became "value of shares sold" because v1 stores no raised total and
    a price change would make a sum of past sales at today's price untrue. ← landing "Social
    proof: quality and provability of numbers", anti-slop "fake and pressure".
11. **Trust section states only what the code enforces.** Each claim maps to program code
    (Token-2022 mint per car, transfer hook allow-list, program-owned revenue vault with a claim
    record per period, MIT repository), and the risks list names the known gaps (the operator
    reports income, no share market). ← anti-slop "fake and pressure", copy "Generic copy
    test".
12. **12 px only in capitals.** The checklist bans sentence text at 12 px, so `text-caption` is
    no longer used for notes; photo notes and badges use `text-small` (14 px). 12 px survives
    only as `text-overline` (uppercase, 600, +0.08em). ← guardrails checklist "Text size:
    minimums".
13. **Numbers follow the reader's locale.** `src/lib/format.ts` formats with `en-US`, `ru-KZ`
    and `kk-KZ`: "1,250.5 SOL" in English, "1 250,5 SOL" in Russian and Kazakh.

14. **A calculator, not a projection.** The asset page used to show a "Revenue projection" with
    made-up income ($800 a month) and made-up specs (Comfort+, 2.0L Hybrid, White). Both are
    gone: the page shows only token metadata and project accounts. The projection became a
    labelled calculator on the reader's own monthly figure, applying the program's split rule
    (each payout divided by the shares sold at that moment; the calculator assumes a fully sold
    car). Results read "—" until the reader types. ← anti-slop "fake and pressure", decision 10.
15. **The purchase button always tells the truth.** It is primary only when pressing it does
    something (connect, or buy with an approved wallet). Paused, closed, sold out, checking, not
    approved and "couldn't check" are disabled buttons that name the reason in two words, with
    one explaining sentence beneath. The old dummy "Complete KYC" link to `/kyc` (a 404) is
    removed. ← components "one dominant CTA", checklist "states of interactive elements".
16. **Every wallet page has four designed states.** Disconnected (why a wallet is needed and
    what it unlocks), loading (labels stay, values are placeholders), empty (the next step) and
    error (a retry). ← review rubric "stress states", components "loading → empty → error →
    happy".
17. **Irreversible means confirmed.** Closing a project stops sales and claims for good in v1,
    so the button first opens an inline confirmation naming the car. Red stays reserved for
    this and for errors; a near deadline is amber. ← color "red for errors only".
18. **Tenge for off-chain money, SOL for on-chain money.** Telemetry income (reported in tenge
    by the backend) is formatted with `formatTenge`; it used to show a dollar sign. Chain
    amounts stay in SOL until v2 moves them to tKZT.

## Constraints

- Presentation only. `src/hooks/` and `src/lib/solana/` belong to the v2 integration and are
  not changed by design work.
- Brand: the name AXEL, near-black and the cyan `#06B6D4` stay.
- Live data: the catalog reads two v1 devnet projects, both with test metadata (Toyota Camry
  2023, no image). The UI never shows made-up figures as real.
- No legacy aliases or default Tailwind palettes are left: every screen uses semantic tokens.
  `brand-primary` was removed in stage 3.
- The asset page reads a car's payout periods through `components/asset/useCarPayouts.ts`,
  which calls `fetchAllRevenuePeriods` from `lib/solana/readers`. The v2 integration must keep
  that reader or update this hook.
- The operator console manages `projects[0]` because `useAdminAccess` picks it; v2 replaces the
  hook with roles, and the console header already names the car it manages.
- `src/app/opengraph-image.tsx` draws the social card with static TTF instances of the site
  fonts (`src/fonts/og/`), since Satori cannot read WOFF2. `src/middleware.ts` excludes
  `/opengraph-image` so the i18n rewrite does not turn it into a 404.
- Screenshots: `Google Chrome --headless=new` clamps the window to at least 500 px on macOS, so
  a 390 px capture is really a crop of a 500 px layout. Use Playwright's
  `chrome-headless-shell` for mobile widths.

## Change log

- 2026-09-25: Theme created (stage 1: direction, tokens, fonts, photo set). Calibrated against
  design-lab `knowledge/trends.md`, full update 2026-07.
- 2026-09-25: Stage 2, shell and home. New navbar, mobile menu, footer and social card; the
  catalog page became the landing (hero with chain stats, fleet, how it works, verify, before
  you invest). Grid changed to two columns beside a sticky heading; decisions 10–13 added;
  unused legacy aliases removed.
- 2026-09-25: Stage 3, inner pages. Asset page rebuilt around on-chain data only (fake specs and
  projection removed, calculator added, car payout history, terms ledger, sticky invest panel
  and mobile purchase bar); dashboard, payouts and operator console moved to tokens with
  designed disconnected, loading, empty and error states; modal, toast, table, transaction
  status and error boundary restyled; decisions 14–18 added; last legacy alias removed.
