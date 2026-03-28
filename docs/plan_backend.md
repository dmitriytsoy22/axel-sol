# Backend Developer Plan — RWA Taxi Tokenization

**Role:** Dev C — Backend (NestJS, minimal — no database)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-03-28

---

## Product Context

The backend exists for **one reason only**: there are two operations that physically cannot run in a browser — keeping Yandex Pro API credentials secret and holding an oracle signing keypair. Everything else (investment state, payout history, project status, whitelist) is read directly from the Solana blockchain by the frontend.

**This is not a traditional backend service. It is a secure proxy for two external systems.**

**What the backend does NOT do:**

- Store user data or investment records
- Validate investments (on-chain enforces all rules)
- Track payout history (on-chain stores all ClaimRecords)
- Provide reporting (frontend reads PDAs directly)
- Authenticate users (Sign-In with Solana in the browser)
- Manage sessions or JWT tokens

**What the backend DOES:**

| Responsibility | Why it must be server-side |
| --- | --- |
| Yandex Pro API calls + oracle signing | API credentials and signing keypair must never reach the browser |
| KYC webhook receiver | Sumsub/Veriff needs an HTTPS endpoint to call; triggers on-chain whitelist update |
| Telemetry read endpoint | Serves the daily Yandex Pro figures to the frontend (no DB — served from memory/cache) |

---

## North Star Metric

> The backend has zero knowledge of investment amounts, token balances, or payout history — all of that lives on-chain. The backend only knows about Yandex Pro data and KYC events.

---

## Architecture

```text
Sumsub (KYC provider)
  └── POST /kyc/webhook ──→ [Minimal Backend] ──→ add_to_whitelist (on-chain)
                                                   unfreeze token account

Yandex Pro API
  └── @Cron (daily) ──────→ [Minimal Backend] ──→ record_telemetry (on-chain)
                                    │
                            GET /telemetry/latest
                                    │
                              [Frontend]
```

**No database. No ORM. No migrations. No auth module. No event indexer.**

---

## Epics & User Stories

---

### Epic 1: Yandex Pro Data Ingestion & Oracle

**Business goal:** Daily proof that the tokenized taxi is actually operating — verifiable on-chain by any investor.

#### US-B01 — Yandex Pro Daily Ingestion

> As the platform oracle, I want to automatically fetch daily taxi earnings from Yandex Pro API and push a cryptographic proof to Solana so that investors can verify the asset is generating real income.

**Acceptance Criteria:**

- Scheduled `@Cron` job runs daily at 01:00 (configurable via env var)
- Authenticates with Yandex Pro API using `vehicle_id` and `api_key` from environment secrets (never hardcoded)
- Fetches for previous calendar day: `daily_revenue` (tenge), `mileage_km`, `trips_count`, `car_status` (active / maintenance / inactive)
- Validates response: logs and retries if fields missing or revenue is negative; alerts Sentry after 3 consecutive failures
- Computes SHA-256 hash of canonical JSON: `{ date, vehicle_id, daily_revenue, mileage_km, trips_count, car_status }`
- Signs hash with oracle Ed25519 keypair (loaded from secrets manager at startup, never from env var directly)
- Calls `record_telemetry` on-chain via `@solana/web3.js`; stores the resulting tx signature in memory (last 30 days rolling, no DB)
- On RPC failure: retries once with backoff; logs warning but does not throw — oracle failure should not crash the service

**Priority:** Must Have | **Phase:** 2

---

#### US-B02 — Telemetry Read Endpoint

> As a frontend consumer, I want to fetch today's car telemetry figures so that investors can see live earnings on the dashboard.

**Acceptance Criteria:**

- `GET /telemetry/latest/:project_id` returns the most recent ingested record:
  `{ date, daily_revenue, mileage_km, trips_count, car_status, solana_tx_signature }`
- Response served from in-memory cache (last result of cron job); no DB query
- If no data ingested yet today: returns yesterday's record with `{ stale: true }`
- If no records at all: returns `{ available: false }`
- `solana_tx_signature` allows frontend to link to Solana Explorer for verification

**Priority:** Must Have | **Phase:** 2

---

### Epic 2: KYC Webhook

**Business goal:** When a KYC provider approves an investor, automatically whitelist them on-chain so they can invest without any manual admin action.

#### US-B03 — KYC Approval Webhook

> As the platform, I want to receive KYC approval events from Sumsub and immediately whitelist the approved wallet on-chain so that investors can invest as soon as they pass KYC.

**Acceptance Criteria:**

- `POST /kyc/webhook` receives Sumsub webhook payload
- Verifies request signature using Sumsub webhook secret (reject with `401` if invalid)
- Extracts `wallet_address` from the applicant's `externalUserId` field (wallet address is passed to Sumsub at KYC initiation)
- On `applicantReviewed` event with `reviewResult.reviewAnswer = GREEN`:
  - Calls `add_to_whitelist` instruction on-chain (whitelist PDA)
  - Calls Freeze Authority to unfreeze the investor's token account (if tokens exist)
  - Logs success with wallet address and Solana tx signature
- On `RED` result or any other event: logs and returns `200` (webhook must always return 200 to Sumsub)
- If on-chain call fails: retries once; if still failing, logs to Sentry with full context for manual resolution
- Idempotent: calling twice for the same wallet is safe (on-chain `add_to_whitelist` is a no-op if already whitelisted)

**Priority:** Must Have | **Phase:** 2

---

### Epic 3: Operations & Health

#### US-B04 — Health Check

> As the DevOps operator, I want a health check endpoint so that I can monitor that the service is running and connected to Solana RPC.

**Acceptance Criteria:**

- `GET /health` returns `{ status: "ok", rpc: "connected", oracle: "loaded" }` (503 if RPC unreachable or oracle keypair failed to load)
- `oracle: "loaded"` confirms the signing keypair was loaded successfully at startup — does NOT expose the key
- Response time < 200ms

**Priority:** Must Have | **Phase:** 2

---

## Endpoints Summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Service health + RPC connectivity |
| `GET` | `/telemetry/latest/:project_id` | Latest Yandex Pro figures for dashboard |
| `POST` | `/kyc/webhook` | Sumsub KYC approval → on-chain whitelist |

**Total: 3 endpoints.**

---

## Environment Variables

| Variable | Description |
| --- | --- |
| `SOLANA_RPC_URL` | RPC endpoint (Helius / QuickNode) |
| `ORACLE_KEYPAIR_PATH` | Path to oracle keypair file in secrets manager |
| `YANDEX_PRO_API_KEY` | Yandex Pro API key |
| `YANDEX_PRO_VEHICLE_ID` | Vehicle identifier in Yandex Pro |
| `SUMSUB_WEBHOOK_SECRET` | For verifying Sumsub webhook signatures |
| `PROGRAM_ID` | rwa-taxi Solana program ID |
| `FREEZE_AUTHORITY_KEYPAIR_PATH` | Path to freeze authority keypair |
| `SENTRY_DSN` | Error tracking |
| `CRON_SCHEDULE` | Cron expression for ingestion (default: `0 1 * * *`) |

---

## Phase Delivery Schedule

| Phase | Days | Stories | Key Deliverable |
| --- | --- | --- | --- |
| 1 | 1–5 | Setup | NestJS scaffold, env config module, `@solana/web3.js` connected to devnet |
| 2 | 6–12 | US-B01, US-B02, US-B03, US-B04 | All 3 endpoints + oracle cron working on devnet |
| 3 | 13–18 | Integration | End-to-end: Sumsub mock → webhook → on-chain whitelist; cron → record_telemetry verified on Explorer |
| 5 | 24–29 | Hardening | Sentry alerts, retry logic, startup keypair validation, health check |
| 6 | 30–34 | Deploy | Staging deploy (Railway/Render), smoke test webhook + cron |

**Phases 4 is skipped** — no reporting, no auth, no admin endpoints to build.

---

## External Dependencies

| Dependency | Provider | Needed By | Blocking? |
| --- | --- | --- | --- |
| `record_telemetry` instruction + program ID | Dev B (On-chain) | Phase 2 | Yes — oracle cron calls this |
| `add_to_whitelist` instruction signature | Dev B (On-chain) | Phase 2 | Yes — KYC webhook calls this |
| Freeze Authority keypair / multisig interface | Dev B (On-chain) | Phase 2 | Yes — unfreeze after KYC |
| Sumsub account + webhook secret | Platform ops | Phase 2 | Yes — webhook can't be tested without it |

---

## What Dev C Does NOT Build

This is explicit — these were in the previous plan and are now removed:

- ~~User registration endpoints~~ — not needed; wallet address is the identity
- ~~KYC status DB storage~~ — Sumsub holds the KYC records
- ~~Investment pre-validation API~~ — on-chain enforces all rules
- ~~On-chain event indexer~~ — frontend reads PDAs directly
- ~~Payout engine endpoints~~ — admin sends `deposit_revenue` tx from the frontend admin panel
- ~~Reporting endpoints~~ — frontend reads on-chain accounts
- ~~JWT authentication~~ — Sign-In with Solana in the browser
- ~~PostgreSQL / any database~~ — no persistent storage
- ~~Asset registry~~ — metadata lives in Token-2022 Token Metadata extension

---

## Definition of Done

A user story is complete when:

- [ ] Endpoint or cron job works end-to-end on devnet
- [ ] On-chain calls are retried once on failure; errors reported to Sentry
- [ ] Webhook signature verification in place before any on-chain action
- [ ] No secrets in code, logs, or HTTP responses
- [ ] Reviewed by one other team member
