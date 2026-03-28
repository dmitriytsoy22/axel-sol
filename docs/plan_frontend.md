# Frontend Developer Plan — RWA Taxi Tokenization
**Role:** Dev A — Frontend (Next.js, Wallet Adapter, UI/UX)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-03-28

---

## Product Context

Investors need a clear, trustworthy web interface to discover tokenized taxi assets, invest SOL, monitor their portfolio, and claim revenue. The frontend is the only touchpoint investors interact with — it must abstract blockchain complexity and surface real-time on-chain state cleanly.

**Primary Users:**
- **Investor** — buys tokens, monitors holdings, claims revenue
- **Admin** — manages projects, triggers revenue deposits, manages whitelist

**Non-Users (out of scope for frontend):** Taxi operators, KYC providers (backend-only integration)

---

## North Star Metric

> An investor with zero blockchain experience can complete their first investment in under 5 minutes.

---

## Epics & User Stories

---

### Epic 1: Wallet Connection & Access Control

**Business goal:** Gate the platform to whitelisted wallets only; prevent non-KYC users from reaching investment flows.

#### US-F01 — Connect Wallet
> As an investor, I want to connect my Solana wallet (Phantom / Backpack) so that I can interact with the platform.

**Acceptance Criteria:**
- Wallet connect button is visible in the navbar on all pages
- Supports Phantom and Backpack; shows a picker if multiple adapters are installed
- Connected wallet address is shown (truncated: `Axx...xxB`) with SOL balance
- Disconnect option available at all times
- If no wallet extension detected, show a prompt linking to Phantom install

**Priority:** Must Have
**Phase:** 1

---

#### US-F02 — Whitelist Gate
> As a non-whitelisted investor, I want to see a clear KYC call-to-action so that I understand why I cannot invest yet.

**Acceptance Criteria:**
- Invest button is replaced with "Complete KYC to Invest" CTA if wallet is not whitelisted
- Clicking CTA opens a modal explaining the KYC process steps
- Once whitelisted (backend confirms), the page updates without full reload
- Whitelist status is checked via backend API on wallet connect

**Priority:** Must Have
**Phase:** 2

---

### Epic 2: Car Catalog & Asset Discovery

**Business goal:** Allow investors to browse available tokenized assets and understand the investment opportunity before committing funds.

#### US-F03 — Browse Car Catalog
> As an investor, I want to see all available tokenized taxi assets so that I can decide which one to invest in.

**Acceptance Criteria:**
- Catalog page shows cards for each asset: car photo, make/model/year, funding progress bar, price per token, status badge (Fundraising / Active / Closed)
- Status badge uses distinct colors: yellow (Fundraising), green (Active), grey (Closed)
- Cards are clickable and navigate to the Asset Detail page
- Empty state shown if no assets exist yet
- Page loads data from `GET /projects`

**Priority:** Must Have
**Phase:** 2

---

#### US-F04 — View Asset Detail
> As an investor, I want to see full details of a specific tokenized car so that I can make an informed investment decision.

**Acceptance Criteria:**
- Shows: car metadata (VIN, make, model, year, license), total tokens, tokens remaining, price per token in SOL, min/max investment, fundraising deadline with countdown timer
- Funding progress bar shows % of raise completed
- Shows projected annual revenue and profit formula (Revenue − Expenses − Reserve = Profit)
- Shows on-chain program address and Token-2022 mint address (clickable to Solana Explorer)
- Invest button visible (gated by whitelist per US-F02)

**Priority:** Must Have
**Phase:** 2

---

### Epic 3: Investment Flow

**Business goal:** Allow whitelisted investors to purchase tokens with SOL through a clear, safe, step-by-step transaction flow.

#### US-F05 — Invest in Asset
> As a whitelisted investor, I want to buy tokens using SOL so that I can own a share of the taxi asset.

**Acceptance Criteria:**
- Input field accepts SOL amount; shows equivalent token count in real time (`tokens = amount / price_per_share`)
- Validates: minimum investment, maximum investment, sufficient wallet SOL balance — inline error messages per violation
- "Invest" button disabled until all validation passes
- On submit: calls `POST /investments/prepare` backend endpoint first; if rejected (KYC/whitelist fail) shows specific error message
- On backend approval: constructs and sends `invest` Anchor instruction via connected wallet
- Transaction states: Idle → Awaiting Approval (wallet popup) → Confirming (spinner + "Transaction submitted") → Success / Error
- Success state: shows tx signature with Solana Explorer link; token balance updates on dashboard
- On-chain error codes are decoded into readable messages (e.g., "Investment exceeds maximum allowed per investor")

**Priority:** Must Have
**Phase:** 3

---

#### US-F06 — Transaction Confirmation Feedback
> As an investor, I want real-time feedback on my transaction status so that I know whether my investment succeeded.

**Acceptance Criteria:**
- Spinner shown while waiting for finality (not just tx submission)
- Polls tx confirmation via backend or RPC until `confirmed` commitment
- Toast notification on success (green) and failure (red)
- User can dismiss toast; clicking it opens Solana Explorer for the tx

**Priority:** Must Have
**Phase:** 3

---

### Epic 4: Investor Dashboard

**Business goal:** Give investors a real-time view of their holdings and available revenue to claim.

#### US-F07 — Portfolio Overview
> As an investor, I want to see my current token holdings so that I know the value of my investment.

**Acceptance Criteria:**
- Shows: tokens held, price per token, total value in SOL
- Shows: fundraising status of the project (if still raising: progress bar + deadline)
- Reads token balance directly from on-chain via `getInvestorRecord` or token account balance
- Loading skeleton shown while data fetches

**Priority:** Must Have
**Phase:** 3

---

#### US-F07b — Live Telemetry Widget

> As an investor, I want to see today's real-time car status and earnings so that I can verify the asset is actually generating income.

**Acceptance Criteria:**

- Telemetry card displayed on the dashboard, sourced from `GET /telemetry/latest/:project_id`
- Shows: car status badge (`In Service` / `Maintenance` / `Inactive`), today's revenue in tenge (e.g. **12 400 ₸**), mileage (e.g. **187 km**), trips count (e.g. **14 trips**)
- Example display: *"Car is in service — earned 12 400 ₸ today · 187 km · 14 trips"*
- "Verified on-chain ✓" link opens the Solana Explorer tx for the oracle record (from `solana_tx_signature` field)
- If today's data is not yet ingested (cron hasn't run): shows yesterday's data with label "As of yesterday"
- If car status is `Maintenance` or `Inactive`: shows amber/red badge with last active date
- Loading skeleton while fetching; no error thrown if endpoint returns empty (shows "Data not available yet")

**Priority:** Must Have
**Phase:** 3

---

#### US-F08 — Claim Revenue
> As an investor, I want to claim my share of deposited revenue so that I can receive my earnings in SOL.

**Acceptance Criteria:**
- Shows claimable SOL amount per active revenue period
- "Claim" button per period; disabled if already claimed or nothing to claim
- Clicking Claim calls `claim_revenue` on-chain instruction; same confirmation flow as US-F06
- After successful claim, period row updates to "Claimed ✓" with the amount and date
- If no revenue periods exist: empty state "No revenue periods available yet"

**Priority:** Must Have
**Phase:** 3

---

### Epic 5: Payout History

**Business goal:** Provide transparency and an audit trail of all revenue periods and investor claims.

#### US-F09 — View Payout History
> As an investor, I want to see the history of all revenue periods and my claims so that I can verify my earnings.

**Acceptance Criteria:**
- Paginated table: columns — Period, Revenue (SOL), Expenses (SOL), Profit (SOL), My Share, My Claim, Status (Claimed / Unclaimed / Not Eligible)
- Sorted by date descending (most recent first)
- Data loads from `GET /payouts/history/:address`
- Empty state if no history yet
- Each row shows on-chain tx link for the claim transaction

**Priority:** Must Have
**Phase:** 4

---

### Epic 6: Admin Panel

**Business goal:** Allow platform admins to manage the project lifecycle and trigger revenue deposits without accessing the CLI.

#### US-F10 — Admin Project Dashboard
> As an admin, I want a web panel to see project state and manage operations so that I don't need CLI access for routine tasks.

**Acceptance Criteria:**
- Accessible only to whitelisted admin wallet (checked against backend admin role)
- Shows: current project state (Fundraising / Active / Paused / Closed), total raised (SOL), investor count, total tokens issued
- Button: "Deposit Revenue" — opens a form (revenue SOL, expenses SOL, reserve SOL, period label); on submit calls `POST /admin/revenue/deposit`; shows job status (queued → confirming → done)
- Button: "Pause Project" — confirmation dialog before sending `pause_project` instruction
- Non-admin wallets attempting to access `/admin` are redirected to catalog

**Priority:** Must Have
**Phase:** 4

---

### Epic 7: Non-Functional Requirements

#### US-F11 — Responsive Layout
> As an investor on mobile, I want the platform to be usable on my phone so that I can check my holdings on the go.

**Acceptance Criteria:**
- All pages are usable at 375px width (iPhone SE) and up
- No horizontal scroll on mobile
- Touch targets minimum 44px

**Priority:** Should Have | **Phase:** 4

---

#### US-F12 — Accessibility
> As a user with accessibility needs, I want the platform to be keyboard-navigable so that I can use it without a mouse.

**Acceptance Criteria:**
- All interactive elements reachable via Tab
- ARIA labels on all buttons, inputs, and modals
- Error messages linked to inputs via `aria-describedby`

**Priority:** Should Have | **Phase:** 5

---

#### US-F13 — Security Headers
> As the platform operator, I want the frontend to have proper security headers so that users are protected from common web attacks.

**Acceptance Criteria:**
- Content-Security-Policy configured (no inline scripts)
- All user-facing text fields sanitized before display
- Wallet address format validated before any API call

**Priority:** Must Have | **Phase:** 5

---

## Phase Delivery Schedule

| Phase | Days | Stories | Key Deliverable |
| --- | --- | --- | --- |
| 1 | 1–5 | Setup | Next.js scaffold, wallet adapter, route shells, API client |
| 2 | 6–12 | US-F01, US-F02, US-F03, US-F04 | Catalog + Asset pages live with mock data; whitelist gate |
| 3 | 13–18 | US-F05, US-F06, US-F07, US-F08 | Full invest flow wired; dashboard + claim button working |
| 4 | 19–23 | US-F09, US-F10, US-F11 | Payout history; admin panel; mobile responsive |
| 5 | 24–29 | US-F12, US-F13 | Security hardening; accessibility; component tests |
| 6 | 30–34 | — | Staging deploy; smoke test sign-off; onboarding guide |

---

## External Dependencies

| Dependency | Provider | Needed By | Blocking? |
| --- | --- | --- | --- |
| IDL JSON (program interface) | Dev B (On-chain) | Phase 3 | Yes — can't build invest tx without it |
| `POST /investments/prepare` endpoint | Dev C (Backend) | Phase 3 | Yes — invest button can't submit without it |
| `GET /projects`, `GET /projects/:id` | Dev C (Backend) | Phase 2 | Yes — catalog needs real data |
| Whitelist status API | Dev C (Backend) | Phase 2 | Yes — gate logic needs it |
| `RwaClient` SDK | Dev B (On-chain) | Phase 4 | No — reduces boilerplate, not a blocker |
| Staging backend URL | Dev C (Backend) | Phase 6 | Yes — smoke tests blocked until this is up |

---

## Definition of Done

A user story is complete when:

- [ ] Feature works end-to-end on devnet with a real wallet
- [ ] Loading, empty, and error states are all handled
- [ ] No console errors or warnings in browser devtools
- [ ] Responsive at 375px and 1280px
- [ ] Component test written for the core interaction
- [ ] Reviewed by one other team member
