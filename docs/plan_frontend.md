# Frontend Developer Plan — RWA Taxi Tokenization

**Role:** Dev A — Frontend (Next.js, Wallet Adapter, direct RPC reads)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-03-28

---

## Product Context

The frontend is the primary interface for investors and admins. Because there is no off-chain database, the frontend reads **all state directly from the Solana blockchain** via RPC. There is no backend to call for investment history, project status, token balances, or payout records — all of this comes from on-chain PDAs.

The only backend calls the frontend makes:

- `GET /telemetry/latest/:project_id` — daily car earnings from Yandex Pro (oracle data)

Everything else is on-chain.

**Authentication model:** Sign-In with Solana (SIWS) — wallet signature proves wallet ownership. No JWT, no server session.

**Admin model:** Admin is identified by `wallet === ProjectState.admin`. Admin actions (deposit_revenue, pause_project, add_to_whitelist) are sent as on-chain transactions directly from the browser using the connected admin wallet.

---

## North Star Metric

> An investor with zero blockchain experience can complete their first investment in under 5 minutes.

---

## On-chain Reads Reference

Key reads the frontend performs directly against Solana RPC:

| Data needed | On-chain source |
| --- | --- |
| Project status, SOL raised, deadline | `getAccountInfo(ProjectState PDA)` |
| Investor's tokens + SOL invested | `getAccountInfo(InvestorRecord PDA)` |
| Token balance | `getTokenAccountBalance(investor ATA)` |
| Wallet is whitelisted? | `getAccountInfo(WhitelistEntry PDA)` — exists + `approved: true` |
| All revenue periods | `getProgramAccounts` filtered by `RevenuePeriod` discriminator |
| Claimed for a period? | `getAccountInfo(ClaimRecord PDA)` — exists = already claimed |
| Car metadata (VIN, model, year) | Token-2022 `TokenMetadata` extension on mint |
| Today's telemetry | `GET /telemetry/latest/:project_id` (only backend call) |

---

## Epics & User Stories

---

### Epic 1: Wallet Connection & Access Control

**Business goal:** Gate admin and investment flows by wallet identity; surface KYC status from on-chain whitelist.

#### US-F01 — Connect Wallet

> As an investor, I want to connect my Solana wallet (Phantom / Backpack) so that I can interact with the platform.

**Acceptance Criteria:**

- Wallet connect button visible in navbar on all pages
- Supports Phantom and Backpack; shows a picker if multiple adapters installed
- Connected wallet address shown (truncated `Axx...xxB`) with SOL balance
- Disconnect available at all times
- If no wallet extension detected: prompt linking to Phantom install

**Priority:** Must Have | **Phase:** 1

---

#### US-F02 — Whitelist Status Check

> As an investor, I want to see whether my wallet is whitelisted so that I understand whether I can invest or need to complete KYC.

**Acceptance Criteria:**

- On wallet connect: fetch `WhitelistEntry PDA` for the connected wallet from on-chain
- If PDA exists and `approved: true` → wallet is cleared to invest; show invest button
- If PDA does not exist → show "Complete KYC to Invest" CTA linking to the Sumsub KYC form (external link)
- Status re-checked on every page focus (wallet may have been approved while on the page)
- No backend call required — purely an on-chain PDA read

**Priority:** Must Have | **Phase:** 2

---

### Epic 2: Car Catalog & Asset Discovery

**Business goal:** Allow investors to browse tokenized assets and understand the opportunity before committing.

#### US-F03 — Browse Car Catalog

> As an investor, I want to see all available tokenized taxi assets so that I can decide which one to invest in.

**Acceptance Criteria:**

- Reads all `ProjectState` PDAs via `getProgramAccounts` filtered by program
- Card per asset: car photo (from Token Metadata `uri` JSON), make/model/year, funding progress bar, price per token (SOL), status badge (Fundraising / Active / Closed)
- Status derived from `ProjectState.status` field
- Empty state if no projects exist
- Loading skeleton during RPC fetch

**Priority:** Must Have | **Phase:** 2

---

#### US-F04 — View Asset Detail

> As an investor, I want to see full details of a specific tokenized car so that I can make an informed investment decision.

**Acceptance Criteria:**

- Reads `ProjectState PDA` for full params: total tokens, remaining, price per token (SOL), min/max investment, deadline with live countdown
- Reads Token-2022 `TokenMetadata` extension: VIN, make, model, year, insurance, license
- Funding progress bar: `sol_raised / max_raise`
- Shows on-chain mint address + program address (each a clickable Solana Explorer link)
- Invest button (gated by US-F02 whitelist check)

**Priority:** Must Have | **Phase:** 2

---

### Epic 3: Investment Flow

**Business goal:** Allow whitelisted investors to buy tokens with SOL through a clear, trust-building transaction flow.

#### US-F05 — Invest in Asset

> As a whitelisted investor, I want to buy tokens using SOL so that I can own a share of the taxi asset.

**Acceptance Criteria:**

- SOL amount input field; shows token count in real time: `tokens = floor(amount / price_per_share)`
- Client-side preflight validation (reading on-chain state — no backend call):
  - Wallet SOL balance ≥ input amount + estimated tx fee
  - `amount_lamports` ≥ `ProjectState.min_investment`
  - `amount_lamports` ≤ `ProjectState.max_investment`
  - Existing `InvestorRecord.sol_invested + amount` ≤ per-investor cap
  - `ProjectState.status == Fundraising` and deadline not passed
- Inline error message per failed check; Invest button disabled until all pass
- On submit: constructs `invest` Anchor instruction and sends via connected wallet
- Transaction states: Idle → Awaiting Wallet Approval → Confirming → Success / Error
- Success: shows tx signature with Explorer link; token balance and dashboard update
- On-chain error codes decoded to readable strings (e.g., `WhitelistEntryNotFound` → "Your wallet is not whitelisted. Please complete KYC.")

**Priority:** Must Have | **Phase:** 3

---

#### US-F06 — Transaction Confirmation Feedback

> As an investor, I want real-time status of my transaction so that I know whether it succeeded.

**Acceptance Criteria:**

- Polls RPC for `confirmed` commitment (not just tx submission)
- Spinner shown during confirmation ("Confirming on Solana...")
- Green toast on success; red toast on failure — both dismissible
- Clicking toast opens Solana Explorer for the tx
- Timeout after 60s with "Transaction may have failed — check Explorer" message

**Priority:** Must Have | **Phase:** 3

---

### Epic 4: Investor Dashboard

**Business goal:** Give investors a real-time view of their holdings, claimable revenue, and proof the car is working.

#### US-F07 — Portfolio Overview

> As an investor, I want to see my current token holdings and investment value so that I know the state of my investment.

**Acceptance Criteria:**

- Reads `InvestorRecord PDA` and token account balance from on-chain
- Shows: tokens held, price per token (SOL), total value (SOL), SOL invested
- If fundraising still open: progress bar + deadline countdown
- Loading skeleton during RPC fetch

**Priority:** Must Have | **Phase:** 3

---

#### US-F07b — Live Telemetry Widget

> As an investor, I want to see today's car status and earnings so that I can verify the asset is generating income.

**Acceptance Criteria:**

- Calls `GET /telemetry/latest/:project_id` (the only backend call on this page)
- Shows: car status badge (In Service / Maintenance / Inactive), today's revenue in tenge (e.g. **12 400 ₸**), mileage (e.g. **187 km**), trips count (e.g. **14 trips**)
- Example: *"Car is in service — earned 12 400 ₸ today · 187 km · 14 trips"*
- "Verified on Solana ✓" links to Solana Explorer for the `record_telemetry` tx (`solana_tx_signature` from response)
- If `stale: true` in response: label "As of yesterday" shown
- If `available: false`: empty state "Telemetry data not yet available"
- Car status `Maintenance` / `Inactive`: amber/red badge

**Priority:** Must Have | **Phase:** 3

---

#### US-F08 — Claim Revenue

> As an investor, I want to claim my share of deposited revenue so that I receive my SOL earnings.

**Acceptance Criteria:**

- Reads all `RevenuePeriod` PDAs via `getProgramAccounts`
- For each period: reads `ClaimRecord PDA` for `(period, wallet)` — if it exists, period is already claimed
- Shows claimable SOL amount per unclaimed period: `(token_balance / period.token_supply_snapshot) × period.total_deposited`
- "Claim" button per period; disabled if already claimed
- Clicking Claim sends `claim_revenue` on-chain tx; same confirmation flow as US-F06
- After confirmation: period row updates to "Claimed ✓ [amount] SOL [date]" with Explorer link
- Empty state: "No revenue periods available yet"

**Priority:** Must Have | **Phase:** 3

---

### Epic 5: Payout History

**Business goal:** Full earnings transparency — all on-chain, no backend query.

#### US-F09 — View Payout History

> As an investor, I want to see the history of all revenue periods and my claims so that I can verify my total earnings.

**Acceptance Criteria:**

- Reads all `RevenuePeriod` PDAs and all `ClaimRecord` PDAs for the connected wallet via `getProgramAccounts`
- Table columns: Period, Total Deposited (SOL), My Share (SOL), My Claim (SOL), Status (Claimed ✓ / Unclaimed / Not Eligible), On-chain link
- Sorted by period index descending
- "Not Eligible" shown if investor held 0 tokens at the time of the period snapshot
- Empty state if no periods exist yet
- No backend call — purely on-chain reads

**Priority:** Must Have | **Phase:** 4

---

### Epic 6: Admin Panel

**Business goal:** Admin manages the project lifecycle by sending on-chain transactions directly — no backend intermediary.

#### US-F10 — Admin Panel

> As an admin, I want a web panel to manage the project and send admin transactions without using the CLI.

**Acceptance Criteria:**

- Route `/admin` accessible only when `connected wallet === ProjectState.admin` (read from on-chain); all other wallets redirected
- Reads `ProjectState PDA` live: current status, SOL raised, tokens issued, investor count (counted from `InvestorRecord` PDAs)
- **Deposit Revenue:** form with inputs (gross_revenue_sol, expenses_sol, reserve_sol, period_label); on submit, builds and sends `deposit_revenue` instruction directly from admin wallet
- **Pause / Resume Project:** buttons send `pause_project` / `resume_project` instruction with confirmation dialog
- **Close Project:** button with double-confirmation; sends `close_project` instruction
- All transactions show the same confirmation feedback as US-F06
- No backend call — all actions are on-chain transactions signed by admin wallet

**Priority:** Must Have | **Phase:** 4

---

### Epic 7: Non-Functional Requirements

#### US-F11 — Responsive Layout

> As an investor on mobile, I want the platform to work on my phone so that I can check holdings on the go.

**Acceptance Criteria:**

- All pages usable at 375px (iPhone SE) and up; no horizontal scroll
- Touch targets minimum 44px

**Priority:** Should Have | **Phase:** 4

---

#### US-F12 — RPC Error Handling

> As a user, I want graceful error messages when blockchain reads fail so that I understand the problem and can retry.

**Acceptance Criteria:**

- All `getAccountInfo` / `getProgramAccounts` calls have try/catch
- RPC timeout or error shows: "Could not load on-chain data. Check your connection and try again." with a Retry button
- Loading state shown during all RPC calls; never shows stale data without a loading indicator

**Priority:** Must Have | **Phase:** 3

---

#### US-F13 — Security Headers

> As the platform, I want the frontend to have proper security headers so that users are protected from common web attacks.

**Acceptance Criteria:**

- Content-Security-Policy configured (no inline scripts)
- All user-facing text fields sanitized before display
- Wallet address format validated before any on-chain call

**Priority:** Must Have | **Phase:** 5

---

## Phase Delivery Schedule

| Phase | Days | Stories | Key Deliverable |
| --- | --- | --- | --- |
| 1 | 1–5 | Setup | Next.js scaffold, wallet adapter, RPC client helper, route shells |
| 2 | 6–12 | US-F01, US-F02, US-F03, US-F04 | Catalog + Asset pages; whitelist check from on-chain |
| 3 | 13–18 | US-F05, US-F06, US-F07, US-F07b, US-F08, US-F12 | Full invest flow; dashboard with telemetry + claim |
| 4 | 19–23 | US-F09, US-F10, US-F11 | Payout history; admin panel; mobile responsive |
| 5 | 24–29 | US-F13 | Security headers; accessibility; component tests |
| 6 | 30–34 | — | Staging deploy; smoke test; onboarding guide |

---

## External Dependencies

| Dependency | Provider | Needed By | Blocking? |
| --- | --- | --- | --- |
| IDL JSON (stable) | Dev B (On-chain) | Phase 3 | Yes — needed to build invest/claim txs |
| IDL JSON (frozen) | Dev B (On-chain) | Phase 3 end | Yes — final tx construction |
| All PDA seeds documented | Dev B (On-chain) | Phase 2 | Yes — needed to derive PDAs client-side |
| `GET /telemetry/latest` live on devnet | Dev C (Backend) | Phase 3 | Yes — telemetry widget blocked until this is up |
| Sumsub KYC form URL | Platform ops | Phase 2 | Yes — KYC CTA links to external form |

---

## What Frontend Does NOT Need from Backend

This is explicit — previously required backend calls, now eliminated:

- ~~`POST /investments/prepare`~~ — preflight is done client-side via on-chain reads
- ~~`POST /investments/confirm`~~ — not needed; on-chain event is the source of truth
- ~~`GET /projects`~~ — frontend reads `ProjectState` PDAs via `getProgramAccounts`
- ~~`GET /payouts/history`~~ — frontend reads `RevenuePeriod` + `ClaimRecord` PDAs
- ~~JWT login~~ — wallet signature (SIWS) proves identity; no token exchange
- ~~`GET /admin/reports`~~ — admin reads on-chain state directly in the admin panel

---

## Definition of Done

A user story is complete when:

- [ ] Feature works end-to-end on devnet with a real wallet
- [ ] All on-chain reads have loading, empty, and error states handled
- [ ] No console errors or warnings in browser devtools
- [ ] Responsive at 375px and 1280px
- [ ] Component test written for the core interaction
- [ ] Reviewed by one other team member
