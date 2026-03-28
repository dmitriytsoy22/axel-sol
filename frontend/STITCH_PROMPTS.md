# AXEL — Промпт для Stitch (быстрый дизайн)

> Скопируй один из промптов ниже в Stitch для генерации конкретного экрана.
> Все промпты используют единую дизайн-систему.

---

## Общий Design Brief (вставлять в начало каждого промпта)

```
Design style: Apple.com-inspired minimalism. Clean, confident, content-first.
Color scheme: Light theme only.
- Background: #FFFFFF
- Secondary background: #F5F5F7
- Text primary: #1D1D1F
- Text secondary: #6E6E73
- Text tertiary: #86868B
- Brand/accent: #06B6D4 (Cyan) — used ONLY for CTAs, links, active states
- Success: #34C759 (green)
- Warning: #FF9F0A (amber/orange)
- Error: #FF3B30 (red)
- Borders: #D2D2D7
- Subtle borders: #E8E8ED

Typography: Inter font family.
- Display: 56px, weight 700, tracking -0.005em
- Headline: 28px, weight 600
- Title: 21px, weight 600
- Body: 17px, weight 400, tracking -0.022em
- Caption: 12px, weight 400
- Numbers/amounts: JetBrains Mono font

Buttons: Pill shape (fully rounded, border-radius 980px). Font weight 400 (regular, NOT bold — Apple style).
- Primary: #06B6D4 fill, white text
- Secondary: transparent, #06B6D4 text, no border
- Danger: #FF3B30 fill, white text

Cards: border-radius 18px. White on grey sections, subtle border (#E8E8ED) on white sections.
Inputs: border-radius 12px, 1px border #D2D2D7, focus border #06B6D4.
Badges/Status: Pill shape (980px). Muted background (10% opacity of status color) + status color text.
Shadows: Very subtle. Cards have almost no shadow. Only dropdowns and modals get shadow.
Spacing: Generous whitespace. 8px base grid. Page max-width 980px. Section gaps 80px.
Navbar: 52px height, frosted glass (blur 20px), "AXEL" text logo left, nav center, wallet right.
Icons: Lucide icon set, 1.5px stroke, 20px default.

Product: AXEL — Real World Asset tokenization platform on Solana blockchain.
Investors buy Token-2022 tokens representing shares in a taxi vehicle, earn revenue from taxi operations, and claim profits on-chain.
```

---

## 1. Landing / Catalog Page

```
[Вставь Design Brief сверху]

Design a landing page with car catalog for an investment platform.

LAYOUT:
- Navbar (52px): "AXEL" left, navigation center (Catalog · Dashboard · Payouts in 12px uppercase), "Connect" cyan text link right
- Hero section on white background:
  - Large heading: "Invest in Real-World Assets" (56px, weight 700, #1D1D1F)
  - Subheading: "Tokenized taxi assets on Solana. Transparent. On-chain." (21px, weight 400, #6E6E73)
  - Pill CTA button: "Explore Assets" (cyan fill, white text)
  - Lots of vertical whitespace (80px above and below)
- Catalog section on #F5F5F7 background:
  - Filter bar: pill chips — "All" (active, cyan fill) · "Fundraising" · "Active" · "Closed" (ghost style)
  - 3-column grid of white asset cards (18px radius):
    - Car photo placeholder (grey #F5F5F7 area with car icon, 16:9 ratio)
    - "Toyota Camry 2024" (19px, weight 600)
    - Status badge pill: "Fundraising" (amber muted bg, amber text, pulsing dot)
    - Progress bar: 6px height, #06B6D4 fill on #E8E8ED track, "67% funded" below
    - "0.5 SOL per token" (JetBrains Mono, 15px, #6E6E73)
  - Show 3 cards with different statuses: Fundraising (amber), Active (green), Closed (grey)
- Minimal footer: "Built on Solana" centered, #86868B text

FEEL: Clean like Apple product page. Whitespace is a feature. No decorations, no gradients, no illustrations.
```

---

## 2. Asset Detail Page

```
[Вставь Design Brief сверху]

Design an asset detail page for a tokenized car investment.

LAYOUT (desktop, 980px max-width):
- Navbar (same as catalog)
- Two-column layout: 60% content left, 40% invest panel right (sticky)

LEFT COLUMN:
- Large car photo placeholder (border-radius 18px, grey bg)
- "Toyota Camry 2024" (Headline 28px) + green "Active" badge pill
- "VIN: XTA21150064821547 · License: 01KZ782BCA" (15px, #6E6E73)
- Divider line (#E8E8ED)
- Funding Progress section:
  - Progress bar (6px, cyan fill): "150 / 200 SOL raised"
  - "50 tokens remaining" (#6E6E73)
  - Countdown: "12d 05h 32m 18s" in JetBrains Mono
- Divider
- Investment Details (key-value rows with thin dividers):
  - Price per token: 1.0 SOL (right-aligned, JetBrains Mono)
  - Min investment: 0.5 SOL
  - Max investment: 10.0 SOL
  - Total tokens: 200
  - Tokens remaining: 50
- Divider
- On-chain addresses:
  - Program: "4K3D...7nUj" (cyan, JetBrains Mono, with external link icon ↗)
  - Token Mint: "9xQe...3mPk" (cyan, JetBrains Mono)
- Revenue Projection section:
  - "Projected Annual Revenue" (Title 21px)
  - Horizontal bars: Revenue 500 SOL, Expenses 200 SOL, Reserve 50 SOL = Profit 250 SOL (bold, cyan bar)

RIGHT COLUMN (sticky invest panel, white card, 18px radius, subtle shadow):
- "Invest Now" title
- SOL input field (border-radius 12px, large 24px font)
- "You will receive 5 tokens" (15px, #6E6E73)
- Pill button: "Invest" (full-width, cyan fill, white text, 17px, weight 400)
- Below: "Min 0.5 SOL · Max 10.0 SOL" caption (#86868B)

FEEL: Clean financial product page. Numbers are prominent. Trust through clarity.
```

---

## 3. Dashboard

```
[Вставь Design Brief сверху]

Design an investor dashboard showing portfolio, live car telemetry, and revenue claims.

LAYOUT (980px max-width):
- Navbar with connected wallet: pill chip showing "Ax4r...9kPm · 12.5 SOL" in JetBrains Mono on #F5F5F7 bg

SECTION 1 — Portfolio Summary (3 metric cards on #F5F5F7 bg):
- Card 1: "Total Value" label (12px, #6E6E73), "24.5 SOL" value (28px, JetBrains Mono, #1D1D1F), Coins icon
- Card 2: "Tokens Held" — "15"
- Card 3: "Unclaimed Revenue" — "3.2 SOL" (highlight with cyan color)
- Cards: white, 18px radius, very subtle shadow

SECTION 2 — Today's Activity (telemetry widget):
- White card on white bg (thin #E8E8ED border)
- Title: "Today's Activity" (21px)
- Car status badge: "In Service" (green pill)
- 3 metrics in a row:
  - "12 400 ₸" (revenue, 24px JetBrains Mono, bold)
  - "187 km" (mileage)
  - "14 trips" (trips count)
- Footer: "Verified on Solana ✓" in cyan with link icon

SECTION 3 — Revenue Periods:
- Title: "Revenue" (21px)
- List of period rows with thin dividers:
  - Row 1: "Q4 2025" · "Deposited: 10.0 SOL" · "Your share: 1.5 SOL" · Green text "Claimed ✓"
  - Row 2: "Q1 2026" · "Deposited: 12.0 SOL" · "Your share: 1.7 SOL" · Cyan pill button "Claim 1.7 SOL"
  - Row 3: "Q2 2026" · "Deposited: 8.0 SOL" · "Your share: 1.2 SOL" · Cyan pill button "Claim 1.2 SOL"

SECTION 4 — Holdings Table:
- Simple table: Asset | Tokens | Value | Status | Action
- One row: "Toyota Camry 2024" | "15" | "15.0 SOL" | Green "Active" badge | Cyan "View" link

FEEL: Financial dashboard that breathes. Like checking your Apple Card statement — calm, clear, trustworthy.
```

---

## 4. Invest Modal

```
[Вставь Design Brief сверху]

Design an investment modal overlay for buying tokenized asset shares.

MODAL:
- Backdrop: dark overlay with blur
- Modal card: white, border-radius 22px, padding 32px, max-width 480px, centered
- Close button (×) top right

CONTENT:
- Title: "Invest in Toyota Camry 2024" (21px, weight 600)
- Subtitle: "Enter the amount of SOL you want to invest" (#6E6E73, 17px)

- Large SOL input:
  - "SOL" label inside, right-aligned
  - Value: "5.0" (24px, JetBrains Mono)
  - Border-radius 12px, border #D2D2D7
  - Below input: "You will receive 5 tokens" (#6E6E73, 15px)

- Validation messages (below input, 13px):
  - Show one in red (#FF3B30): "Minimum investment is 0.5 SOL" (this is just an example state)

- Summary section (light grey #F5F5F7 bg area, border-radius 12px, padding 16px):
  - Row: "Amount" — "5.0 SOL" (JetBrains Mono)
  - Row: "Tokens" — "5"
  - Row: "Network fee" — "~0.01 SOL" (#86868B)
  - Divider
  - Row: "Total" — "5.01 SOL" (weight 600)

- Full-width pill button: "Invest 5.0 SOL" (cyan fill, white text, weight 400)
- Caption below: "Transaction requires wallet approval" (#86868B, 13px)

Show a second state of the same modal: "Confirming" state:
- Same modal but input replaced with:
  - Subtle spinner (cyan)
  - "Confirming on Solana..." (17px, #1D1D1F)
  - Truncated tx hash as cyan link: "4K3D...7nUj ↗"

FEEL: Simple, focused, no distractions. Like Apple Pay confirmation — clean summary then one button.
```

---

## 5. Admin Panel

```
[Вставь Design Brief сверху]

Design an admin panel for managing a tokenized asset project.

LAYOUT (980px max-width):
- Navbar with "AXEL" and connected admin wallet chip

- Title: "Admin Panel" (Headline 28px)

SECTION 1 — Project Status:
- Large status badge: "Active" (green pill, bigger than usual — 16px text)
- Metric cards in a row (white on #F5F5F7):
  - "SOL Raised" — "150.0 SOL"
  - "Investors" — "47"
  - "Tokens Issued" — "150"
  - "Revenue Deposited" — "30.0 SOL"

SECTION 2 — Deposit Revenue (white card, 18px radius):
- Title: "Deposit Revenue" (21px)
- Form fields (vertical stack, 12px radius inputs):
  - "Revenue (SOL)" — input with value "15.0"
  - "Expenses (SOL)" — input with value "5.0"
  - "Reserve (SOL)" — input with value "2.0"
  - "Period Label" — input with value "Q1 2026"
- Calculated result: "Profit: 8.0 SOL" (JetBrains Mono, weight 600, #1D1D1F)
- Pill button: "Deposit Revenue" (cyan fill)

SECTION 3 — Project Controls:
- Two buttons side by side:
  - "Pause Project" (outlined pill, subtle border)
  - "Close Project" (red #FF3B30 pill — danger)

FEEL: Clean admin tool. No clutter. Like a Stripe dashboard — professional, minimal.
```

---

## 6. Payout History

```
[Вставь Design Brief сверху]

Design a payout history page showing all revenue periods and claims.

LAYOUT (980px max-width):
- Title: "Payout History" (Headline 28px)
- Subtitle: "All revenue periods and your claims — verified on-chain" (#6E6E73, 17px)

SUMMARY CARDS (3 cards on #F5F5F7 bg):
- "Total Claimed" — "4.5 SOL" (green #34C759 text)
- "Unclaimed" — "2.9 SOL" (amber #FF9F0A text)
- "Total Periods" — "5"

TABLE:
- Header row: Period | Deposited | My Share | Claimed | Status | TX (12px uppercase, #6E6E73)
- Data rows with thin #E8E8ED dividers:
  - "Q4 2025" | "10.0 SOL" | "1.5 SOL" | "1.5 SOL" | Green pill "Claimed ✓" | Cyan "4K3D...↗"
  - "Q1 2026" | "12.0 SOL" | "1.7 SOL" | "—" | Amber pill "Unclaimed" + small cyan "Claim" link | —
  - "Q2 2026" | "8.0 SOL" | "1.2 SOL" | "—" | Amber pill "Unclaimed" + small cyan "Claim" link | —
- Numbers in JetBrains Mono

FEEL: Clean data table like Apple support pages. Scannable rows. Clear status indicators.
```

---

## 7. Mobile Views (375px)

```
[Вставь Design Brief сверху]

Design mobile versions (375px width, iPhone SE) of these screens:

SCREEN 1 — CATALOG (mobile):
- Navbar: "AXEL" left, hamburger icon right (3 lines)
- Hero: "Invest in Real-World Assets" (40px), subtitle, cyan CTA pill
- Filter pills: horizontal scroll
- Single column cards, full-width

SCREEN 2 — ASSET DETAIL (mobile):
- Single column: photo → info → progress → details
- Sticky bottom bar: "Invest Now" full-width cyan pill button (safe-area padding)
- All content stacked vertically

SCREEN 3 — DASHBOARD (mobile):
- Metric cards: single column stack
- Telemetry widget: metrics stacked vertically
- Revenue periods: simplified cards instead of table

SCREEN 4 — MOBILE MENU (drawer):
- Slide-in from right, backdrop blur
- Full-height white panel
- Nav links stacked vertically (17px, weight 400)
- Wallet info at bottom: full address (copyable) + SOL balance + Disconnect button (red text)

Show all 4 screens side by side.
FEEL: Spacious even on small screens. Large touch targets (44px min). Apple iOS-like mobile experience.
```

---

## 8. Wallet States

```
[Вставь Design Brief сверху]

Design 4 wallet connection states for the navbar area (52px height):

STATE 1 — NOT CONNECTED:
- Right side of navbar: "Connect" text in cyan (#06B6D4), no button styling

STATE 2 — CONNECTING:
- Right side: subtle spinner (12px, cyan) + "Connecting..." in #6E6E73

STATE 3 — CONNECTED:
- Pill chip: #F5F5F7 background, border-radius 980px, padding 6px 12px
- Inside: "Ax4r...9kPm" (JetBrains Mono 13px) + "12.5 SOL" (13px, #6E6E73)

STATE 4 — WALLET DROPDOWN (on click of connected chip):
- Small dropdown card below chip (white, 14px radius, shadow-md)
- Full address: "Ax4rK8m6...vN9kPm" (JetBrains Mono 13px) with copy icon
- "12.5 SOL" balance
- Divider
- "Disconnect" in #FF3B30 text

Show all 4 states in a row.
FEEL: Subtle, not intrusive. Wallet is there when you need it, invisible when you don't.
```

---

## 9. Empty & Error States

```
[Вставь Design Brief сверху]

Design these empty and error states:

STATE 1 — WALLET NOT CONNECTED (full page, centered):
- "Connect your wallet to get started" (Display 40px, #1D1D1F)
- "View your investments, track earnings, and claim revenue." (#6E6E73, 17px)
- Pill button: "Connect Wallet" (cyan fill)
- No illustrations — text only

STATE 2 — NO INVESTMENTS (dashboard):
- "No investments yet" (Headline 28px)
- "Browse the catalog to find your first investment." (#6E6E73, 17px)
- Cyan text link: "Explore Assets →"

STATE 3 — RPC ERROR (inline):
- Warning icon (lucide AlertTriangle, 24px, #FF9F0A)
- "Could not load on-chain data" (17px, #1D1D1F)
- "Check your connection and try again." (#6E6E73, 15px)
- Pill button: "Retry" (cyan outline)

STATE 4 — TRANSACTION ERROR (in modal):
- Red circle with × icon
- "Transaction failed" (17px, #FF3B30)
- "Investment exceeds maximum per investor." (#6E6E73, 15px)
- Cyan text link: "Try again"

STATE 5 — KYC REQUIRED (inline on asset page, replaces invest button):
- "Verification Required" (21px, #1D1D1F)
- "Complete identity verification to invest." (#6E6E73, 17px)
- Pill button: "Start Verification →" (cyan fill)

Show all 5 states.
FEEL: Calm, helpful, never alarming. Minimal text. Clear next action.
```
