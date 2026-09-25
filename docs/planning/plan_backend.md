# Backend Developer Plan — RWA Taxi Tokenization

**Role:** russh (Backend) (NestJS, minimal — no database)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-04-06 (post-implementation refresh)

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

#### US-B01 — Yandex Pro Daily Ingestion [DONE]

> As the platform oracle, I want to automatically fetch daily taxi earnings from Yandex Pro API and push a cryptographic proof to Solana so that investors can verify the asset is generating real income.

**Status: DONE**

- `@Cron` job runs daily at 01:00 (configurable via `CRON_SCHEDULE` env var)
- `YandexFleetService` calls Yandex Fleet API (`POST /v1/parks/orders/list`) with `X-Client-ID` + `X-API-Key` auth
- Fetches previous day's completed orders, filters by vehicle license plate (Cyrillic → Latin normalization)
- Deducts 22% Yandex commission + 2% tx costs (NET_INCOME_FACTOR = 0.76)
- Computes SHA-256 hash of canonical JSON: `{ date, vehicle_id, daily_revenue, mileage_km, trips_count, car_status }`
- Oracle keypair loaded from file at startup (`ORACLE_KEYPAIR_PATH`); calls `record_telemetry` on-chain
- In-memory rolling cache (last 30 days per project, no DB)
- Retries once on failure; falls back to deterministic simulation if Yandex credentials not configured
- Orders cached for 5 minutes to prevent Yandex rate limiting; paginates with cursor for large result sets

**Priority:** Must Have | **Phase:** 2

---

#### US-B02 — Telemetry Read Endpoint [DONE]

> As a frontend consumer, I want to fetch today's car telemetry figures so that investors can see live earnings on the dashboard.

**Status: DONE**

- `GET /telemetry/latest/:projectId` returns most recent ingested record:
  `{ date, dailyRevenue, mileageKm, tripsCount, carStatus, dataHash, solanaTxSignature, stale, available }`
- Response served from in-memory cache (last result of cron job); no DB query
- If no data ingested yet today: returns yesterday's record with `stale: true`
- If no records at all: returns `{ available: false }`
- `solanaTxSignature` allows frontend to link to Solana Explorer for verification

**Priority:** Must Have | **Phase:** 2

---

### Epic 2: KYC Webhook

**Business goal:** When a KYC provider approves an investor, automatically whitelist them on-chain so they can invest without any manual admin action.

#### US-B03 — KYC Approval Webhook [DONE]

> As the platform, I want to receive KYC approval events from Sumsub and immediately whitelist the approved wallet on-chain so that investors can invest as soon as they pass KYC.

**Status: DONE**

- `POST /kyc/webhook` receives Sumsub webhook payload
- Verifies HMAC-SHA256 signature from `x-payload-digest` header using `SUMSUB_WEBHOOK_SECRET` (rejects with 401 if invalid; skips check if secret not configured)
- Extracts wallet address from `externalUserId` field (passed to Sumsub at KYC initiation)
- On `applicantReviewed` event with `reviewResult.reviewAnswer = GREEN`:
  - Loads admin keypair from `ADMIN_KEYPAIR_PATH`
  - Builds and submits `add_to_whitelist` transaction on-chain
  - Returns Solana tx signature in response
- On `RED` result or any other event type: logs and returns 200 (no on-chain action)
- Retries once on on-chain failure
- Idempotent: `add_to_whitelist` uses `init_if_needed` — calling twice for the same wallet is safe

**Priority:** Must Have | **Phase:** 2

---

### Epic 3: Operations & Health

#### US-B04 — Health Check [DONE]

> As the DevOps operator, I want a health check endpoint so that I can monitor that the service is running and connected to Solana RPC.

**Status: DONE**

- `GET /health` returns `{ status: "ok", rpc: "connected", oracle: "loaded" | "not_configured" }`
- Returns 503 if RPC unreachable
- `oracle` field confirms whether the signing keypair was loaded at startup — does NOT expose the key

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

## Implementation Status

### DONE

| Item | Files |
| --- | --- |
| NestJS scaffold + config module | `backend/src/main.ts`, `backend/src/app.module.ts` |
| Solana RPC service (global) | `backend/src/solana/solana.service.ts` |
| Health check endpoint | `backend/src/health/health.controller.ts` |
| Yandex Fleet API client | `backend/src/yandex/yandex-fleet.service.ts` |
| Telemetry cron + oracle submission | `backend/src/telemetry/telemetry-cron.service.ts` |
| Telemetry read endpoint | `backend/src/telemetry/telemetry.controller.ts` |
| KYC webhook + on-chain whitelist | `backend/src/kyc/kyc.service.ts`, `backend/src/kyc/kyc.controller.ts` |

### TO DO (post-MVP)

| Item | Priority |
| --- | --- |
| Sentry error tracking integration | Hardening |
| Staging deploy (Railway/Render) | Deploy |
| End-to-end integration testing with Sumsub mock | Integration |

---

## Phase Delivery Schedule

| Phase | Stories | Status |
| --- | --- | --- |
| 1 | Setup (scaffold, env, RPC) | DONE |
| 2 | US-B01, US-B02, US-B03, US-B04 | DONE |
| 3 | Integration testing | TODO (post-MVP) |
| 5 | Hardening (Sentry, retries) | TODO (post-MVP) |
| 6 | Staging deploy | TODO (post-MVP) |

**Phase 4 is skipped** — no reporting, no auth, no admin endpoints to build.

---

## External Dependencies

| Dependency | Provider | Needed By | Blocking? |
| --- | --- | --- | --- |
| `record_telemetry` instruction + program ID | ndrkbrg (On-chain) | Phase 2 | DONE |
| `add_to_whitelist` instruction signature | ndrkbrg (On-chain) | Phase 2 | DONE |
| Freeze Authority keypair / multisig interface | ndrkbrg (On-chain) | Phase 2 | DONE (program PDA is freeze authority) |
| Sumsub account + webhook secret | Platform ops | Integration | Yes — webhook can't be tested without it |

---

## What russh Does NOT Build

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
