# RWA Taxi Tokenization — Development Plan

## Architectural Principle

**The blockchain is the only source of truth.** There is no off-chain database. The frontend reads all state (investments, payouts, whitelist, project status) directly from Solana PDAs via RPC. The backend exists only to protect two secrets: the Yandex Pro API key and the oracle signing keypair.

## Team Roles

- **dimagonedone (Frontend)** (Next.js, Wallet Adapter, direct RPC reads)
- **ndrkbrg (On-chain)** (Anchor/Rust, Token-2022, Transfer Hook, deployment)
- **russh (Backend)** (NestJS, no DB — oracle cron + KYC webhook only)

---

## Phase 1: Foundation and Project Scaffolding

**Duration: Days 1–5**
**Goal: All three workstreams have running skeletons; PDA layouts and on-chain interfaces agreed.**

**dimagonedone (Frontend)**

- Initialize Next.js project with TypeScript, Tailwind CSS, ESLint
- Integrate `@solana/wallet-adapter-react` with Phantom and Backpack support
- Build global layout shell: navbar, wallet connect button, route placeholders for catalog, asset page, dashboard, payout history, admin
- Set up RPC client helper (`@solana/web3.js` `Connection`) with configurable endpoint and commitment level
- Establish lightweight API client (axios/ky) for the single backend base URL — only needed for telemetry endpoint

**Deliverables:** Running Next.js app, wallet connection working on devnet, RPC helper reading a test account

**ndrkbrg (On-chain)**

- Initialize Anchor workspace with `anchor init rwa-taxi`; add second program `anchor new transfer-hook`
- Define all program account structs: `ProjectState`, `InvestorRecord`, `RevenuePeriod`, `ClaimRecord`, `WhitelistEntry`, `TelemetryRecord`
- Define instruction stubs: `initialize_project`, `buy_tokens`, `deposit_revenue`, `claim_revenue`, `pause_project`, `resume_project`, `close_project`, `add_to_whitelist`, `remove_from_whitelist`, `record_telemetry`
- Define Transfer Hook program stub: `execute` instruction
- Plan Token-2022 mint extensions: Transfer Hook, Default Account State (Frozen), Permanent Delegate, Transfer Fee, Token Metadata + Metadata Pointer, Memo Transfer
- Configure devnet deployment keypairs and Squads multisig for upgrade authority
- Write Anchor test scaffolds
- **Export and document IDL JSON and all PDA seeds** — critical dependency for dimagonedone and russh
- Write `scripts/init-project.ts` CLI seed script — calls `initialize_project` with devnet test params so dimagonedone and russh can bootstrap a project without waiting for the admin panel UI (Phase 4)

**Deliverables:** Compilable Anchor workspace deployed to devnet, IDL JSON exported, all PDA seeds documented, `init-project.ts` seed script running on devnet

**russh (Backend)**

- Initialize minimal NestJS project: two modules only — `ingestion` and `kyc`
- Set up env config module (dotenv, Joi validation) for all required secrets (no DB connection string)
- Load oracle keypair at startup from secrets path; verify it loads correctly; fail fast if missing
- Connect `@solana/web3.js` to devnet RPC
- Scaffold `GET /health` endpoint

**Deliverables:** NestJS app starts cleanly, oracle keypair loads, RPC connected to devnet, health endpoint responds

**Dependencies:**

- ndrkbrg must document PDA seeds before dimagonedone can derive whitelist/investor PDAs client-side
- ndrkbrg must expose `record_telemetry` and `add_to_whitelist` instruction signatures before russh can call them

---

## Phase 2: Core On-chain Logic + Backend

**Duration: Days 6–12**
**Goal: All on-chain instructions implemented and tested; backend oracle and KYC webhook working end-to-end on devnet.**

**dimagonedone (Frontend)**

- Build Car Catalog page: reads all `ProjectState` PDAs via `getProgramAccounts`, renders asset cards with status badges
- Build Asset Detail page: reads `ProjectState` PDA + Token-2022 `TokenMetadata` extension; funding progress bar; countdown timer
- Implement whitelist status check: derives `WhitelistEntry PDA` for connected wallet; shows KYC CTA if not found
- Build invest flow UI: SOL amount input, token count preview, client-side preflight validation against on-chain state (no backend call)

**Deliverables:** Catalog and Asset pages reading real on-chain data on devnet; whitelist gate working

**ndrkbrg (On-chain)**

- Implement all Token-2022 mint setup with correct extension order
- Implement `initialize_project`: create mint + extensions, mint all tokens to vault, revoke mint authority
- Implement `buy_tokens`: atomic SOL-for-tokens swap from vault to investor
- Implement `deposit_revenue`: creates `RevenuePeriod` PDA, transfers SOL to revenue vault
- Implement `claim_revenue`: calculates share, transfers SOL, creates `ClaimRecord` PDA atomically
- Implement `pause_project`, `resume_project`, `close_project`
- Implement `add_to_whitelist`, `remove_from_whitelist`
- Implement Transfer Hook `execute`: checks `WhitelistEntry` for both sides of every transfer
- Implement `record_telemetry`: creates `TelemetryRecord` PDA; validates oracle authority
- Write full Anchor test suite

**Deliverables:** All instructions passing tests on devnet; Transfer Hook enforcing whitelist; oracle instruction verified

**russh (Backend)**

- Implement `@Cron` Yandex Pro ingestion: fetch API → validate → SHA-256 hash → Ed25519 sign → call `record_telemetry` on-chain
- Implement in-memory cache for last 30 telemetry records (no DB)
- Implement `GET /telemetry/latest/:project_id`
- Implement `POST /kyc/webhook`: verify Sumsub signature → call `add_to_whitelist` → call Freeze Authority to unfreeze token account
- Implement retry logic and Sentry error reporting on all on-chain calls

**Deliverables:** Oracle cron running on devnet; KYC webhook tested with Sumsub mock; all 3 endpoints live

**Dependencies:**

- ndrkbrg's `record_telemetry` and `add_to_whitelist` instructions must be deployed before russh can call them
- ndrkbrg's final account struct layouts determine how dimagonedone derives PDAs client-side

---

## Phase 3: Integration

**Duration: Days 13–18**
**Goal: Full investor journey works end-to-end on devnet; frontend reads all state from chain.**

**dimagonedone (Frontend)**

- Wire buy tokens flow: send `buy_tokens` Anchor instruction on-chain; show confirmation states
- Build Dashboard: reads token balance + `RevenuePeriod` PDAs + `ClaimRecord` PDAs — all from RPC
- Add live telemetry widget: calls `GET /telemetry/latest`; shows earnings + "Verified on Solana ✓" link
- Implement claim flow: per-period claim button → `claim_revenue` on-chain tx → ClaimRecord confirmed
- Implement RPC error handling: loading states, retry buttons, timeout messages

**Deliverables:** Full invest → finalize → deposit revenue → claim flow working on devnet with real wallets

**ndrkbrg (On-chain)**

- Deploy final instruction set to devnet with multisig as upgrade authority
- Run full integration scenario: init project → whitelist 3 wallets → buy tokens → deposit revenue → all claim → verify telemetry record
- Export final versioned IDL; freeze and share with dimagonedone and russh
- Document all PDAs with seeds, bump storage, rent-exempt sizes

**Deliverables:** Stable devnet deployment; integration test script passing; final IDL frozen

**russh (Backend)**

- Integration test: Sumsub mock webhook → `add_to_whitelist` on-chain → verify `WhitelistEntry` PDA exists
- Integration test: cron trigger → Yandex Pro mock → `record_telemetry` on-chain → verify `TelemetryRecord` PDA
- Confirm `GET /telemetry/latest` returns correct data after cron run
- Harden: Sumsub webhook signature verification, idempotent `add_to_whitelist`

**Deliverables:** Both integration scenarios pass on devnet; webhook signature validation confirmed

**Dependencies:**

- ndrkbrg's final IDL must be frozen before dimagonedone finalizes client-side tx construction
- russh's `GET /telemetry/latest` must be live before dimagonedone's telemetry widget works

---

## Phase 4: Admin Panel, Payout History, Polish

**Duration: Days 19–23**
**Goal: Admin can manage the project from the browser; payout history visible on-chain.**

**dimagonedone (Frontend)**

- Build Admin Panel: reads `ProjectState` PDA; sends `deposit_revenue`, `pause_project`, `close_project` txs directly from admin wallet
- Build Payout History page: reads all `RevenuePeriod` + `ClaimRecord` PDAs; no backend call
- Add mobile responsive pass over all pages
- Handle admin identification: `wallet === ProjectState.admin` checked on-chain; redirect non-admins
- Write `RwaClient` helper class: wraps common PDA derivations and `getProgramAccounts` calls used across pages

**Deliverables:** Admin panel sending real on-chain txs; payout history page reading chain; responsive layout

**ndrkbrg (On-chain)**

- Write TypeScript `RwaClient` SDK: `invest()`, `claimRevenue()`, `depositRevenue()`, `getProjectState()`, `getInvestorRecord()`, `harvestTransferFees()`, `unfreezeAccount()` — shared with dimagonedone
- Add ComputeBudget instructions to all transaction builders (avoid CU exhaustion)
- Write devnet reset/seed script for QA runs
- Audit all authority checks; verify `pause_project` blocks all financial instructions

**Deliverables:** `RwaClient` SDK package; devnet seed script; state machine verified

**russh (Backend)**

- Performance: ensure `GET /telemetry/latest` responds in < 100ms (in-memory cache, no I/O)
- Add structured logging (Pino) with request correlation IDs
- Document all 3 endpoints in OpenAPI (inline NestJS decorators — no Swagger UI needed)

**Deliverables:** Fast telemetry endpoint; structured logs; endpoint documentation

---

## Phase 5: Security Hardening and QA

**Duration: Days 24–29**
**Goal: Production-ready security posture; full E2E QA scenario passes.**

**dimagonedone (Frontend)**

- Add Content Security Policy headers; sanitize all user-facing text; validate wallet addresses before on-chain calls
- Accessibility pass: keyboard navigation, ARIA labels
- Run full E2E investor journey with a fresh wallet: KYC mock → whitelist → invest → finalize → claim
- Decode all on-chain error codes into readable messages
- Write component tests for invest flow and claim flow (Vitest / React Testing Library)

**Deliverables:** Security-hardened frontend; E2E journey confirmed; component test suite

**ndrkbrg (On-chain)**

- Security audit:
  - All authority checks use `has_one` or `constraint` in Anchor contexts
  - All arithmetic uses `checked_add`, `checked_mul`, `checked_div`
  - `claim_revenue` creates `ClaimRecord` atomically with SOL transfer
  - Transfer Hook `execute` validates caller is Token-2022 program
  - `record_telemetry` validates caller is registered `oracle_pubkey`
  - `PermanentDelegate` and `TransferFee` harvest authority held by multisig
- Run `cargo clippy`; address all warnings
- Deploy release build to devnet; document final program IDs
- Prepare mainnet deployment checklist

**Deliverables:** Security audit checklist signed off; release build on devnet; mainnet checklist

**russh (Backend)**

- Confirm oracle keypair is loaded from secrets manager (not env var)
- Add startup validation: fail fast if `ORACLE_KEYPAIR_PATH`, `YANDEX_PRO_API_KEY`, `SUMSUB_WEBHOOK_SECRET` are missing
- Verify Sentry alerts on: Yandex Pro API failure after retries, on-chain call failure, invalid webhook signature
- Load test `GET /telemetry/latest`: must handle 100 concurrent requests without issue (in-memory cache)

**Deliverables:** Hardened backend; startup validation; Sentry alerts confirmed working

---

## Phase 6: Staging Deployment and Launch Readiness

**Duration: Days 30–34**
**Goal: Deployed to staging, all smoke tests pass, launch checklist signed off.**

**dimagonedone (Frontend)**

- Deploy frontend to Vercel; configure staging RPC endpoint and backend URL
- Smoke test full investor journey on staging with real devnet wallets
- Smoke test admin panel: deposit revenue, check payout history updates on-chain
- Prepare user onboarding guide (wallet setup, KYC flow, how to invest)

**Deliverables:** Frontend on staging URL; smoke test sign-off; onboarding guide

**ndrkbrg (On-chain)**

- Confirm multisig upgrade authority is set; original keypairs removed from hot storage
- Run final devnet scenario: init project → buy tokens → Transfer Hook enforced → revenue claim → telemetry record verified
- Produce deployment artifact: program IDs, IDL JSON, deployment tx signatures, block heights
- Write emergency runbook: how to `pause_project` and `close_project` if critical bug found post-launch

**Deliverables:** Deployment artifact; multisig confirmed; emergency runbook

**russh (Backend)**

- Deploy to staging (Railway or Render); configure all environment secrets via platform secrets manager
- Confirm cron job fires on schedule and `TelemetryRecord` PDA appears on-chain
- Test Sumsub webhook with real Sumsub test applicant; confirm `WhitelistEntry` PDA created on-chain
- Confirm `GET /health` returns `200` on staging
- Set up UptimeRobot monitoring on `/health`

**Deliverables:** Backend on staging; cron confirmed; webhook tested with real Sumsub flow; monitoring active

---

## Summary Table

| Phase | Days | dimagonedone (Frontend) | ndrkbrg (On-chain) | russh (Backend) |
| --- | --- | --- | --- | --- |
| 1: Foundation | Days 1–5 | Next.js scaffold, RPC helper, route shells | Anchor workspace, all structs + stubs, IDL exported | NestJS scaffold, oracle keypair loaded, health endpoint |
| 2: Core | Days 6–12 | Catalog + asset pages reading on-chain; whitelist check | All instructions + Transfer Hook implemented and tested | Oracle cron + KYC webhook working on devnet |
| 3: Integration | Days 13–18 | Invest flow wired; dashboard from PDAs; telemetry widget | Stable devnet deploy; IDL frozen; integration test passes | Integration tests; webhook signature verified |
| 4: Admin + Polish | Days 19–23 | Admin panel sends txs; payout history from PDAs; mobile | RwaClient SDK; devnet seed script; authority audit | Fast telemetry cache; structured logs |
| 5: Security + QA | Days 24–29 | CSP headers; E2E journey; component tests | On-chain security audit; release build; mainnet checklist | Startup validation; Sentry alerts; load test |
| 6: Staging + Launch | Days 30–34 | Staging deploy; smoke tests; onboarding guide | Deployment artifact; multisig locked; emergency runbook | Staging deploy; cron + webhook confirmed; monitoring |

---

## Key Cross-Team Dependencies

1. **PDA seeds + IDL JSON** (ndrkbrg → dimagonedone): dimagonedone derives all PDAs client-side — needs seeds documented by end of Phase 1, IDL frozen by end of Phase 3.
2. **`record_telemetry` instruction** (ndrkbrg → russh): deployed before russh's cron can push telemetry. Phase 2.
3. **`add_to_whitelist` instruction** (ndrkbrg → russh): deployed before russh's webhook can whitelist. Phase 2.
4. **`GET /telemetry/latest`** (russh → dimagonedone): must be live before dimagonedone's telemetry widget. Phase 3.
5. **`RwaClient` SDK** (ndrkbrg → dimagonedone): Phase 4; reduces PDA derivation boilerplate for dimagonedone.

---

## What Was Deliberately Removed

| Removed | Reason |
| --- | --- |
| PostgreSQL database | All state lives on-chain |
| Event indexer | Frontend reads PDAs directly |
| Investment pre-validation API | On-chain enforces all rules; preflight done client-side |
| Payout engine API | Admin sends `deposit_revenue` tx from browser |
| Reporting endpoints | Admin reads PDAs directly from admin panel |
| JWT authentication | Sign-In with Solana (wallet signature) in browser |
| User registration | Wallet address is identity; whitelist check is on-chain |
| Asset registry API | Metadata in Token-2022 `TokenMetadata` extension |

---

## Critical Files to Create

| File | Owner | Phase |
| --- | --- | --- |
| `programs/rwa-taxi/src/lib.rs` | ndrkbrg | 1–3 |
| `programs/transfer-hook/src/lib.rs` | ndrkbrg | 1–2 |
| `scripts/init-project.ts` | ndrkbrg | 1 |
| `sdk/src/rwa-client.ts` | ndrkbrg | 4 |
| `src/ingestion/ingestion.service.ts` | russh | 2 |
| `src/kyc/kyc.controller.ts` | russh | 2 |
| `src/lib/rpc.ts` (PDA helpers) | dimagonedone | 1 |
| `src/hooks/useInvest.ts` | dimagonedone | 3 |
