# RWA Taxi Tokenization — Development Plan

## Team Roles

- **Dev A — Frontend** (Next.js, Wallet Adapter, UI/UX)
- **Dev B — On-chain / Solana** (Anchor/Rust, Token-2022, Transfer Hook program, deployment)
- **Dev C — Backend** (NestJS, PostgreSQL, business logic, integrations)

---

## Phase 1: Foundation and Project Scaffolding
**Duration: Days 1–5**
**Goal: All three workstreams have running skeletons; shared contracts are agreed upon.**

### Dev A — Frontend
- Initialize Next.js project with TypeScript, Tailwind CSS, ESLint
- Integrate `@solana/wallet-adapter-react` with Phantom and Backpack support
- Build global layout shell: navbar, wallet connect button, empty route placeholders for catalog, asset page, dashboard, payout history
- Set up environment variable structure for RPC endpoint and backend API base URL
- Establish shared API client layer (axios/ky) with typed request/response interfaces

**Deliverables:** Running Next.js app, wallet connection working on devnet, all page routes scaffolded

### Dev B — On-chain

- Initialize Anchor workspace with `anchor init rwa-taxi`; add a second program `anchor new transfer-hook` for the Token-2022 Transfer Hook
- Define all program account structs: `ProjectState`, `InvestorRecord`, `RevenuePeriod`, `WhitelistEntry`
- Define all 9 instruction stubs with context structs (no logic yet): `initialize_project`, `start_raise`, `invest`, `finalize_raise`, `refund`, `deposit_revenue`, `claim_revenue`, `pause_project`, `close_project`
- Define Transfer Hook program stub: `execute` instruction (called by Token-2022 on every token transfer to enforce whitelist)
- Plan Token-2022 mint extensions to enable at initialization: Transfer Hook, Default Account State (Frozen), Permanent Delegate, Transfer Fee, Token Metadata + Metadata Pointer, Memo Transfer
- Configure devnet deployment keypairs and a Squads multisig wallet for upgrade authority
- Write Anchor test scaffolds (empty stubs for each instruction)
- Define and document the shared TypeScript IDL interface for Dev A and Dev C

**Deliverables:** Compilable Anchor workspace (main program + transfer hook program) deployed to devnet, IDL JSON exported, all account layouts documented, Token-2022 extension plan agreed

### Dev C — Backend
- Initialize NestJS monorepo with modules: `users`, `assets`, `projects`, `investments`, `payouts`, `ingestion`
- Set up PostgreSQL with TypeORM/Prisma; write migrations for all 6 core tables: `users`, `assets`, `projects`, `investments`, `revenue_periods`, `payouts`
- Set up environment configuration module (dotenv, Joi validation)
- Scaffold Swagger/OpenAPI documentation endpoint
- Agree with Dev B on data contract: which on-chain account fields the backend mirrors off-chain

**Deliverables:** NestJS app running locally, all DB tables created via migrations, Swagger UI accessible

**Dependencies:**
- Dev B must export IDL JSON before Dev A or Dev C can call program instructions
- Dev C schema decisions (especially `investments` columns) must align with Dev B's on-chain `InvestorRecord`

---

## Phase 2: Core On-chain Logic
**Duration: Days 6–12**
**Goal: All on-chain instructions implemented, tested, and auditable.**

### Dev A — Frontend
- Build Car Catalog page: data from backend API, card layout per asset, status badges (fundraising / active / closed)
- Build Asset Detail page: car metadata, funding progress bar, share price, min/max investment, countdown timer
- Integrate wallet SOL balance display
- Build invest flow UI: SOL amount input, confirmation modal (no on-chain call yet)

**Deliverables:** Catalog and Asset pages rendering with mock/seeded backend data, invest modal UI complete

### Dev B — On-chain

- Implement `initialize_project`: create `ProjectState` PDA, set admin, mint authority, fundraising params (min_raise, max_raise, price_per_share in lamports, token_supply derived from car_cost / price_per_share, deadline)
- Implement `start_raise`: transition state, validate authority
- Implement `invest`: accept SOL transfer (lamports) into escrow vault PDA; create/update `InvestorRecord`; validate whitelist; enforce min/max per investor
- Implement `finalize_raise`: validate min_raise reached, close fundraising window, mint Token-2022 tokens to investors proportional to SOL invested (accounts start frozen per Default Account State)
- Implement `refund`: if min_raise not reached by deadline, use Permanent Delegate to burn any minted tokens, then return SOL from escrow to investor
- Implement `deposit_revenue`: admin deposits SOL into revenue vault; creates `RevenuePeriod` with total deposited and total supply snapshot
- Implement `claim_revenue`: calculate share = (investor_tokens / total_supply) × period_revenue; transfer SOL; mark claim as used per period
- Implement `pause_project` and `close_project` with authority checks
- Write comprehensive Anchor tests for all happy paths and key failure cases (non-whitelisted invest, double-claim, refund after finalize)

**Deliverables:** All 9 instructions implemented and passing tests on devnet

### Dev C — Backend
- Implement `POST /users/register` and `POST /users/kyc-submit`
- Implement KYC status flow: `pending → approved → rejected`
- Implement whitelist management: `POST /admin/whitelist/add`, `DELETE /admin/whitelist/:address` — updates the whitelist PDA read by the Transfer Hook program; after KYC approval, also calls Freeze Authority to unfreeze the investor's token account
- Implement `GET /projects` and `GET /projects/:id`; seed the single MVP car record
- Implement `GET /projects/:id/investments` per user
- Begin on-chain event listener: subscribe to program logs via `@solana/web3.js` `onLogs` to index `invest`, `refund`, `claim_revenue` events into PostgreSQL

**Deliverables:** User registration, KYC, whitelist endpoints live; project read endpoints live; on-chain event indexer running

**Dependencies:**
- Dev B must expose the whitelist PDA instruction before Dev C can implement the whitelist endpoint
- Dev B's `InvestorRecord` layout determines what Dev C's event indexer parses

---

## Phase 3: Integration Layer
**Duration: Days 13–18**
**Goal: Frontend calls backend and on-chain; end-to-end investment flow works on devnet.**

### Dev A — Frontend
- Wire invest flow: call backend `POST /investments/prepare` for pre-validation (KYC, whitelist, limits), then construct and send `invest` Anchor instruction client-side
- Implement transaction status feedback: spinner, success/error toasts, Solana Explorer link
- Build Dashboard page: user holdings (tokens owned, current value), active revenue periods, claimable SOL
- Implement Claim button: calls `claim_revenue` on-chain; shows pending/confirmed state
- Add whitelist-gate UI: if wallet is not whitelisted, show KYC CTA instead of invest button

**Deliverables:** Full invest flow working end-to-end on devnet; dashboard showing real on-chain data; claim working

### Dev B — On-chain
- Deploy final instruction set to devnet with multisig as upgrade authority
- Run full integration test scenario: initialize project → whitelist 3 wallets → all 3 invest → finalize raise → deposit revenue → all 3 claim
- Fix edge cases found during integration (overflow checks, clock/timestamp handling, account reinitialization guards)
- Export final versioned IDL; share with Dev A and Dev C
- Document all PDAs: seeds, bump storage, account size for rent calculation

**Deliverables:** Stable devnet deployment; integration test script passing; PDA documentation complete

### Dev C — Backend
- Implement `POST /investments/prepare`: validate KYC status, whitelist status, amount range; return validation token for frontend
- Implement `POST /investments/confirm`: called after on-chain tx confirms; records investment from indexed event
- Implement Payout Engine: `POST /admin/revenue/deposit` triggers admin to call `deposit_revenue` on-chain with SOL; records `revenue_period` in DB with revenue, expenses, reserve, computed profit
- Implement `GET /payouts/history/:address`: return all past claim events for a wallet
- Implement Data Ingestion stub: `@Cron` job calling mock taxi operator API; stores raw revenue data into `revenue_periods`

**Deliverables:** Investment prepare/confirm API live; payout engine depositing revenue on-chain; payout history endpoint live; ingestion cron running

**Dependencies:**
- Dev B's final IDL must be frozen before Dev A finalizes client-side instruction calls
- Dev C's `POST /investments/prepare` must be ready before Dev A can wire the invest button
- Dev C's event indexer (Phase 2) must be confirmed working before `POST /investments/confirm` is reliable

---

## Phase 4: Admin, Reporting, and Polish
**Duration: Days 19–23**
**Goal: Operational completeness — admin can manage the car, payout history visible, reporting works.**

### Dev A — Frontend
- Build Payout History page: paginated table of revenue periods, per-period profit, user's claimed amount and date
- Build Admin Panel (whitelist-only access): project state, fundraising totals, investor count, revenue deposited, button to trigger revenue deposit
- Add error boundary and wallet disconnect/reconnect handling
- Implement transaction confirmation polling: show "confirming..." while waiting for finality
- Mobile-responsive pass over all pages

**Deliverables:** Payout history page functional; admin panel operational; responsive layout

### Dev B — On-chain

- Write TypeScript `RwaClient` SDK wrapper: `invest()`, `claimRevenue()`, `getInvestorRecord()`, `getProjectState()`, `harvestTransferFees()` — shared by Dev A and Dev C; wrap Token-2022 extension calls (`unfreezeAccount`, `harvestWithheldTokensToMint`) behind clean methods
- Add compute budget instructions to all client-side transaction builders to avoid CU exhaustion
- Write devnet reset/seed script for QA runs
- Audit all authority checks; verify `pause_project` correctly blocks `invest` and `claim_revenue`

**Deliverables:** `RwaClient` SDK package; devnet seed script; pause/close state machine verified

### Dev C — Backend
- Implement `GET /admin/reports/summary`: total raised, investors, revenue deposited, total claimed, unclaimed balance
- Implement `GET /admin/reports/revenue-periods`: list all periods with profit breakdown (Revenue − Expenses − Reserve = Profit)
- Implement rate limiting and class-validator DTOs on all endpoints
- Add JWT authentication; admin role guard on all `/admin/*` routes
- Set up Bull queue for async on-chain transactions (revenue deposit is async — return job ID, poll for status)

**Deliverables:** Reporting endpoints live; auth and rate-limiting hardened; async job queue for on-chain operations

**Dependencies:**
- Dev B's `RwaClient` SDK reduces boilerplate for Dev A's transaction construction
- Admin panel (Dev A) calls Dev C's admin endpoints which call Dev B's program — all three must be integrated and tested together

---

## Phase 5: Security Hardening and QA
**Duration: Days 24–29**
**Goal: Production-ready security posture for MVP; full E2E QA scenario passes.**

### Dev A — Frontend
- Add Content Security Policy headers, sanitize all user-facing text fields, validate wallet address format before any API call
- Run full investor journey with a fresh wallet: register → KYC mock approval → whitelist → invest → finalize → claim
- Fix all UI feedback gaps: loading states, empty states, on-chain error messages decoded into human-readable strings
- Accessibility pass: keyboard navigation, ARIA labels
- Write component tests for invest flow and dashboard (Vitest / React Testing Library)

**Deliverables:** Security-hardened frontend; full E2E investor journey confirmed; component test suite

### Dev B — On-chain
- Security audit checklist:
  - All authority checks use `has_one` or `constraint` in Anchor contexts
  - No integer overflow — use `checked_add`, `checked_mul` throughout token math
  - Whitelist PDA cannot be spoofed (seed derivation deterministic and non-guessable)
  - Transfer Hook `execute` instruction validates caller is the Token-2022 program (not callable directly)
  - Permanent Delegate authority is held by the multisig, not a hot key
  - Transfer Fee harvest authority is held by the multisig
  - `claim_revenue` marks claim per-period-per-investor atomically
  - `pause_project` correctly halts all financial instructions
- Run program through `cargo clippy`; address all warnings
- Deploy release build to devnet; document final program ID
- Prepare mainnet deployment checklist

**Deliverables:** Security audit report (internal checklist); release build on devnet; program ID documented; mainnet checklist

### Dev C — Backend
- Implement input sanitization on all DTOs; add Helmet.js headers; configure CORS to frontend domain only
- Implement idempotency keys on investment and payout endpoints (use Solana tx signature as idempotency key)
- Add structured logging (Winston/Pino) with correlation IDs on all requests
- Set up `GET /health` endpoint checking DB and RPC connectivity
- Write integration tests for the full payout engine flow (mock on-chain calls)
- Ensure data ingestion cron handles taxi API failures gracefully (retry with backoff, dead letter queue)

**Deliverables:** Hardened backend; idempotency on financial endpoints; integration test suite; health check endpoint

**Dependencies:**
- All three developers run the full E2E scenario together before sign-off
- Dev B's security audit findings may require small on-chain changes — Dev A and Dev C must re-test affected flows

---

## Phase 6: Staging Deployment and Launch Readiness
**Duration: Days 30–34**
**Goal: Deployed to staging, documentation complete, launch checklist signed off.**

### Dev A — Frontend
- Deploy frontend to Vercel; configure staging RPC and backend URL env vars
- Final content pass: car metadata, legal disclaimer, FAQ placeholder
- Smoke test all user flows on staging with real wallets and devnet SOL
- Prepare short user onboarding guide (KYC flow, wallet connection, how to invest)

**Deliverables:** Frontend live on staging URL; onboarding guide; smoke test sign-off

### Dev B — On-chain
- Confirm program ID is consistent across all environments
- Confirm multisig upgrade authority is set and original keypairs removed from hot storage
- Run final devnet scenario confirming SOL escrow, token minting, and claim flows end-to-end
- Produce deployment artifact: program ID, IDL JSON, deployment tx signature, block height
- Document emergency procedures: how to `pause_project` and `close_project` in case of critical bug

**Deliverables:** Deployment artifact document; multisig authority locked; emergency runbook

### Dev C — Backend
- Deploy NestJS backend to staging (Railway/Render/Docker on VPS); configure managed PostgreSQL
- Run migrations on staging; seed the single MVP car asset record
- Set up monitoring: Sentry for errors, UptimeRobot for uptime
- Configure data ingestion cron against stable mock API endpoint
- Final API contract review: compare Swagger output against what Dev A's client expects; resolve mismatches

**Deliverables:** Backend live on staging; monitoring configured; final API contract verified

**Dependencies:**
- Dev C's staging backend must be up before Dev A can run staging smoke tests
- Dev B's final program ID must be propagated to Dev A's and Dev C's environment configs before staging deploy

---

## Summary Table

| Phase | Duration | Dev A (Frontend) | Dev B (On-chain) | Dev C (Backend) |
|-------|----------|-----------------|-----------------|-----------------|
| 1: Foundation | Days 1–5 | Next.js scaffold, wallet adapter, route shells | Anchor workspace, account structs, instruction stubs | NestJS scaffold, DB schema, migrations |
| 2: Core On-chain | Days 6–12 | Catalog + asset pages, invest UI (not wired) | All 9 instructions implemented and tested | Users, KYC, whitelist, project endpoints, event indexer |
| 3: Integration | Days 13–18 | Wire invest flow, dashboard, claim button | Stable devnet deploy, integration tests, IDL frozen | Invest prepare/confirm, payout engine, ingestion cron |
| 4: Admin + Reporting | Days 19–23 | Payout history, admin panel, mobile responsive | RwaClient SDK, devnet seed script, pause/close audit | Reporting endpoints, auth/rate-limit, async job queue |
| 5: Security + QA | Days 24–29 | Security headers, E2E journey, component tests | On-chain security audit, release build, mainnet checklist | Idempotency, structured logging, integration tests |
| 6: Staging + Launch | Days 30–34 | Staging deploy, smoke tests, onboarding guide | Multisig lock-down, deployment artifact, emergency runbook | Staging deploy, monitoring, final API contract review |

---

## Key Cross-Team Dependencies

1. **IDL JSON** (Dev B → Dev A + Dev C): hard blocker for client-side instruction calls and event parsing. Must be stable by end of Phase 2, frozen by Phase 3.
2. **Whitelist instruction signature** (Dev B → Dev C): must be agreed upon before Dev C implements the whitelist management endpoint in Phase 2.
3. **`POST /investments/prepare`** (Dev C → Dev A): must be live before Dev A can wire the invest button in Phase 3.
4. **`RwaClient` SDK** (Dev B → Dev A + Dev C): shared dependency in Phase 4; significantly reduces transaction boilerplate.
5. **Event indexer accuracy** (Dev C Phase 2): foundation for all reporting and payout history — gaps here compound in later phases.
6. **Staging backend URL** (Dev C → Dev A): must be provided before Dev A can run Phase 6 smoke tests.

---

## Critical Files to Create

| File | Owner | Phase |
|------|-------|-------|
| `programs/rwa-taxi/src/lib.rs` | Dev B | 1–3 |
| `programs/transfer-hook/src/lib.rs` | Dev B | 1–2 |
| `src/payouts/payout.service.ts` | Dev C | 3 |
| `src/hooks/useInvest.ts` | Dev A | 3 |
| DB migration: `investments`, `revenue_periods` | Dev C | 1 |
| `sdk/src/rwa-client.ts` | Dev B | 4 |
