# Backend Developer Plan — RWA Taxi Tokenization
**Role:** Dev C — Backend (NestJS, PostgreSQL, integrations)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-03-28

---

## Product Context

The backend is the authoritative off-chain layer between the frontend, the Solana program, and the taxi operator data. It owns business logic that cannot or should not live on-chain: KYC verification, profit calculation, data ingestion from taxi operators, reporting, and async job orchestration.

**Consumers of the backend API:**
- Frontend (Dev A) — investor-facing and admin-facing UX
- On-chain indexer (internal) — mirrors on-chain events into PostgreSQL for fast querying

**Key constraints:**
- Financial endpoints must be idempotent (no double-processing of investments or payouts)
- All on-chain actions initiated by the backend must be async (queue-based, not synchronous HTTP)
- KYC data must never be stored on-chain — backend is the sole custodian

---

## North Star Metric

> Every SOL invested and every SOL claimed can be traced back to an exact on-chain transaction with a matching backend record — zero discrepancies.

---

## Database Schema

```
users            — wallet address, KYC status, role
assets           — car metadata (VIN, make, model, year, valuation)
projects         — links asset → on-chain program; fundraising params; status
investments      — investor wallet, project, amount (lamports), tx signature, timestamp
revenue_periods  — project, gross revenue, expenses, reserve, profit, on-chain deposit tx
payouts          — investor wallet, revenue_period, amount claimed, claim tx signature
```

---

## Epics & User Stories

---

### Epic 1: User Registration & KYC

**Business goal:** Build a compliant identity layer — only KYC-approved wallets may invest or hold tokens.

#### US-B01 — User Registration
> As a new investor, I want to register my wallet so that the platform knows who I am.

**Acceptance Criteria:**
- `POST /users/register` accepts `{ wallet_address }`, creates a user record with status `pending_kyc`
- Returns `201` on success; `409` if wallet already registered
- Wallet address validated as valid base58 Solana public key
- No duplicate users for the same wallet address

**Priority:** Must Have | **Phase:** 2

---

#### US-B02 — KYC Submission
> As an investor, I want to submit my KYC information so that I can be approved to invest.

**Acceptance Criteria:**
- `POST /users/kyc-submit` accepts KYC data payload; stores off-chain only (never logged to on-chain)
- Status transitions: `pending_kyc → under_review → approved | rejected`
- `GET /users/kyc-status/:wallet` returns current status and rejection reason if applicable
- Admin can manually approve/reject via `PATCH /admin/users/:wallet/kyc-status`

**Priority:** Must Have | **Phase:** 2

---

#### US-B03 — Whitelist Management
> As an admin, I want to add and remove wallets from the investment whitelist so that only verified investors can participate.

**Acceptance Criteria:**
- `POST /admin/whitelist/add` — validates KYC is `approved`, then calls on-chain whitelist PDA instruction (coordinate address with Dev B); also calls Freeze Authority to unfreeze the investor's token account if tokens have been minted
- `DELETE /admin/whitelist/:address` — removes from on-chain whitelist PDA
- `GET /admin/whitelist` — returns paginated list of all whitelisted wallets with KYC status
- If on-chain call fails, the DB record is not updated — operation is atomic
- Both endpoints require admin JWT role

**Priority:** Must Have | **Phase:** 2

---

### Epic 2: Asset & Project Management

**Business goal:** Maintain the authoritative off-chain registry of tokenized assets and their on-chain project state.

#### US-B04 — Asset Registry
> As the platform, I want to store car metadata off-chain so that the frontend can display rich asset information without querying the blockchain.

**Acceptance Criteria:**
- `GET /assets` — returns list of all assets (pagination: `limit`, `offset` query params)
- `GET /assets/:id` — returns full asset detail including on-chain mint address and program address
- `POST /admin/assets` — creates a new asset record (admin only); validates required fields: VIN, make, model, year, valuation_sol
- Asset record mirrors metadata stored in Token-2022 Token Metadata extension

**Priority:** Must Have | **Phase:** 2

---

#### US-B05 — Project Tracking
> As a frontend consumer, I want to query project fundraising state so that I can display accurate progress to investors.

**Acceptance Criteria:**
- `GET /projects` — returns all projects with current status (derived from on-chain event indexer)
- `GET /projects/:id` — returns project detail: asset, fundraising params, tokens sold, SOL raised, deadline
- Status field reflects latest on-chain state: `fundraising | finalized | active | paused | closed`
- On-chain event indexer (Phase 2) keeps status in sync automatically

**Priority:** Must Have | **Phase:** 2

---

### Epic 3: Investment Management

**Business goal:** Validate investment intent off-chain before the investor signs a transaction, and record confirmed investments for reporting.

#### US-B06 — Investment Pre-Validation
> As a frontend, I want to validate an investment request before the user signs so that on-chain transactions are never sent for obviously invalid inputs.

**Acceptance Criteria:**
- `POST /investments/prepare` — accepts `{ wallet_address, project_id, amount_lamports }`
- Validates:
  - Wallet is registered and KYC `approved`
  - Wallet is whitelisted on-chain
  - `amount_lamports` ≥ `min_investment` and ≤ `max_investment`
  - Project status is `fundraising`
  - Investor has not exceeded per-investor cap
- Returns `200 { valid: true, validation_token }` or `400 { valid: false, reason: "..." }`
- Validation token expires in 5 minutes (prevents stale submissions)

**Priority:** Must Have | **Phase:** 3

---

#### US-B07 — Investment Confirmation
> As the platform, I want to record a confirmed on-chain investment so that reporting and payout calculations are accurate.

**Acceptance Criteria:**
- `POST /investments/confirm` — accepts `{ tx_signature, wallet_address, project_id }`
- Verifies tx signature on-chain before recording (waits for `confirmed` commitment)
- Idempotent: second call with same `tx_signature` returns `200` without creating duplicate record
- Records: wallet, project, amount_lamports, tx_signature, confirmed_at timestamp
- Triggers update to project's `sol_raised` aggregate

**Priority:** Must Have | **Phase:** 3

---

#### US-B08 — On-chain Event Indexer
> As the platform, I want to automatically mirror on-chain events into the database so that backend state stays in sync without polling.

**Acceptance Criteria:**
- Subscribes to program logs via `@solana/web3.js` `onLogs` for events: `invest`, `refund`, `finalize_raise`, `deposit_revenue`, `claim_revenue`
- Parses event fields from program log output (coordinate log format with Dev B)
- Upserts records into `investments`, `revenue_periods`, `payouts` tables
- On RPC connection drop: reconnects with exponential backoff; logs gap in coverage
- Indexer state (last processed slot) persisted to DB; resumes from last slot on restart

**Priority:** Must Have | **Phase:** 2

---

### Epic 4: Payout Engine

**Business goal:** Accurately calculate investor profit shares and orchestrate the on-chain revenue deposit lifecycle.

#### US-B09 — Revenue Deposit
> As an admin, I want to trigger a SOL revenue deposit to the on-chain vault so that investors can claim their share.

**Acceptance Criteria:**
- `POST /admin/revenue/deposit` — accepts `{ project_id, gross_revenue_sol, expenses_sol, reserve_sol, period_label }`
- Backend calculates: `profit = gross_revenue - expenses - reserve`
- Enqueues an async Bull job to call `deposit_revenue` on-chain (does NOT block the HTTP response)
- Returns `202 { job_id }` immediately
- `GET /admin/revenue/jobs/:job_id` — returns job status: `queued | processing | confirmed | failed`
- On-chain deposit tx signature recorded in `revenue_periods` table when confirmed
- If on-chain call fails, job status set to `failed` with error reason; no DB record created

**Priority:** Must Have | **Phase:** 3

---

#### US-B10 — Payout History
> As a frontend, I want to retrieve all revenue periods and claim events for a wallet so that investors can see their full earnings history.

**Acceptance Criteria:**
- `GET /payouts/history/:wallet_address` — returns all revenue periods the investor is eligible for, with: period label, profit (SOL), investor share (SOL), claimed amount, claim tx signature, claim date
- Eligibility: investor held tokens at the time of the revenue period snapshot
- Empty array returned (not 404) if no history exists
- Sorted by period date descending

**Priority:** Must Have | **Phase:** 3

---

### Epic 5: Data Ingestion

**Business goal:** Automatically pull taxi revenue data from operator APIs and feed it into the payout engine.

#### US-B11 — Taxi Revenue Ingestion
> As the platform, I want to automatically fetch earnings data from the taxi operator API so that admins don't need to enter figures manually.

**Acceptance Criteria:**
- Scheduled `@Cron` job runs on configurable interval (default: daily at 00:00)
- Calls mock taxi operator API endpoint; parses gross revenue for the period
- Stores raw ingestion record in `revenue_periods` with status `pending_admin_review`
- Does NOT automatically trigger on-chain deposit — admin reviews and confirms via US-B09
- On API failure: logs structured error, increments retry counter, alerts via Sentry after 3 consecutive failures
- Dead letter queue for failed ingestion jobs

**Priority:** Should Have | **Phase:** 3

---

### Epic 6: Reporting & Admin

**Business goal:** Give platform operators visibility into the full financial state of the project.

#### US-B12 — Summary Report
> As an admin, I want a summary of platform financials so that I can report on project health at any time.

**Acceptance Criteria:**
- `GET /admin/reports/summary` returns:
  - Total SOL raised
  - Total investors
  - Total tokens issued
  - Total revenue deposited (SOL)
  - Total claimed (SOL)
  - Unclaimed balance (SOL)
- All values cross-referenced between on-chain event index and DB records
- Returns `200` even if all values are zero (not 404)

**Priority:** Must Have | **Phase:** 4

---

#### US-B13 — Revenue Period Report
> As an admin, I want a breakdown of each revenue period so that I can verify profit calculations.

**Acceptance Criteria:**
- `GET /admin/reports/revenue-periods` returns paginated list: period label, gross revenue, expenses, reserve, profit, deposit tx, total claimed, unclaimed
- Each period includes per-investor claim status (optional `?detail=true` query param)
- Profit formula shown: `Profit = Gross Revenue − Expenses − Reserve`

**Priority:** Must Have | **Phase:** 4

---

### Epic 7: Security & Infrastructure

#### US-B14 — Authentication & Authorization
> As the platform, I want protected endpoints secured by JWT so that only authorized actors can perform admin operations.

**Acceptance Criteria:**
- `POST /auth/login` — accepts wallet signature (prove ownership); returns JWT
- JWT contains `wallet_address` and `role` (`investor` | `admin`)
- All `/admin/*` routes require `admin` role (403 otherwise)
- Token expiry: 24h; refresh token: 7 days
- Invalid or expired tokens return `401` with clear error message

**Priority:** Must Have | **Phase:** 4

---

#### US-B15 — Idempotency & Rate Limiting
> As the platform, I want financial endpoints to be idempotent and rate-limited so that double-submissions and abuse are prevented.

**Acceptance Criteria:**
- `POST /investments/confirm` is idempotent on `tx_signature` (second call: no duplicate DB record)
- `POST /admin/revenue/deposit` is idempotent on `period_label + project_id`
- All public endpoints: max 60 requests/minute per IP
- All authenticated endpoints: max 200 requests/minute per wallet
- Rate limit exceeded returns `429` with `Retry-After` header

**Priority:** Must Have | **Phase:** 5

---

#### US-B16 — Health & Observability
> As the DevOps operator, I want a health check endpoint and structured logs so that I can monitor the service in production.

**Acceptance Criteria:**
- `GET /health` returns `{ status: "ok", db: "connected", rpc: "connected" }` (503 if either is down)
- All requests logged with correlation ID (traceable across services)
- Sentry integration: uncaught exceptions and failed Bull jobs reported
- Winston/Pino structured JSON logs in production

**Priority:** Must Have | **Phase:** 5

---

## Phase Delivery Schedule

| Phase | Days | Stories | Key Deliverable |
| --- | --- | --- | --- |
| 1 | 1–5 | Setup | NestJS scaffold, all 6 DB tables migrated, Swagger UI |
| 2 | 6–12 | US-B01–B05, US-B08 | Registration, KYC, whitelist, project endpoints, event indexer |
| 3 | 13–18 | US-B06, US-B07, US-B09, US-B10, US-B11 | Invest prepare/confirm, payout engine, ingestion cron |
| 4 | 19–23 | US-B12, US-B13, US-B14 | Reporting endpoints, JWT auth, admin role guard |
| 5 | 24–29 | US-B15, US-B16 | Idempotency, rate limiting, health check, integration tests |
| 6 | 30–34 | — | Staging deploy, monitoring setup, final API contract review |

---

## External Dependencies

| Dependency | Provider | Needed By | Blocking? |
| --- | --- | --- | --- |
| Whitelist PDA instruction address & seeds | Dev B (On-chain) | Phase 2 | Yes — whitelist endpoint calls on-chain |
| On-chain event log format (invest, refund, etc.) | Dev B (On-chain) | Phase 2 | Yes — indexer can't parse without it |
| Freeze Authority keypair / multisig | Dev B (On-chain) | Phase 2 | Yes — KYC approval unfreezes token accounts |
| Transfer Hook program ID | Dev B (On-chain) | Phase 2 | Yes — whitelist PDA seeds are shared with hook |

---

## Definition of Done

A user story is complete when:

- [ ] Endpoint documented in Swagger with request/response schemas
- [ ] Input validated via `class-validator` DTOs (no raw `any` types)
- [ ] Returns correct HTTP status codes for all success and error cases
- [ ] Integration test covers happy path and at least one failure case
- [ ] On-chain calls go through the Bull job queue (not synchronous)
- [ ] Reviewed by one other team member
