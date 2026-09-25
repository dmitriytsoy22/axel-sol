# AXEL — Tokenized Taxi Cars on Solana

[![CI](https://github.com/dmitriytsoy22/axel-sol/actions/workflows/ci.yml/badge.svg)](https://github.com/dmitriytsoy22/axel-sol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-14F195.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-devnet-9945FF)](https://explorer.solana.com/address/DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M?cluster=devnet)
[![Colosseum](https://img.shields.io/badge/Colosseum-Crypto%20World%27s%20Fair%202026-14F195)](https://colosseum.com/arena/projects/axel-1)

> Fractional ownership of taxi cars on Solana: each car is a Token-2022 mint, shares are sold only to whitelisted wallets, and the car's revenue is paid out pro-rata by an Anchor program.

[Docs](docs/) · [Architecture](docs/architecture.md) · [Colosseum Project](https://colosseum.com/arena/projects/axel-1) · [Devnet Program](https://explorer.solana.com/address/DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M?cluster=devnet)

---

![AXEL home page: an Almaty night street behind the headline, with cars listed, shares sold and payout periods read live from Solana devnet](assets/hero.png)

---

## Built for Colosseum Crypto World's Fair 2026

| Name | Role | GitHub | Based in |
|------|------|--------|----------|
| Dmitriy Tsoy | Founder, frontend & product | [@dmitriytsoy22](https://github.com/dmitriytsoy22) | Almaty, Kazakhstan |

AXEL existed before the hackathon. See [Prior Work and Hackathon Scope](#prior-work-and-hackathon-scope) for what was built when and by whom.

---

## Problem and Solution

### 1. Access to cash-flowing assets
- **Problem:** A taxi earns money every day, but earning from one means buying and running the whole car. There is no simple way to hold a small, transferable share of one specific vehicle.
- **AXEL:** `initialize_project` creates one Token-2022 mint per car with 0 decimals, so one token is one whole share. The share cap is `car_cost / price_per_share`. Whitelisted wallets buy shares for SOL with `buy_tokens`, which mints them on demand up to that cap. Once every share is sold, the admin can call `revoke_mint_authority` to remove the mint authority for good.

### 2. Trust in reported income
- **Problem:** Co-investors in a car usually see only the income the owner chooses to report.
- **AXEL:** Every deposit, every claim and the share count behind each payout are public program accounts. A backend job aggregates the car's daily Yandex Fleet orders (revenue, mileage, trips) and hashes them with SHA-256. `record_telemetry` lets only the project's registered oracle key write such a hash on-chain, once per day, and anyone holding the same figures can recompute it.
- **Gaps:** the admin chooses the deposited amount, and the program does not check it against telemetry. The backend does not send `record_telemetry` (its v1 transaction was broken and was removed; v2 batches are next), so no telemetry hash is on devnet yet.

### 3. Compliance and KYC on every transfer
- **Problem:** A plain SPL token can be sent to anyone. Shares of a real asset need an allow-list of holders, enforced on every transfer and not only at the first sale.
- **AXEL:**
  - `buy_tokens` requires an approved `WhitelistEntry` PDA for the buyer.
  - The mint uses `DefaultAccountState = Frozen`, so every new token account starts frozen. The program, as freeze authority, thaws the buyer's account inside `buy_tokens`.
  - A separate `transfer_hook` program runs on every `transfer_checked` and rejects the transfer unless the owners of both the source and the destination accounts are whitelisted.
  - On v1, wallets are whitelisted from the admin panel. The backend's KYC flow already targets v2: a wallet signs in, passes Sumsub, and the webhook writes its v2 KYC record with a dedicated key.
- **Gap:** `add_to_whitelist` does not check who signs yet, so the on-chain gate is only as strong as that fix.

### 4. Fair payouts
- **Problem:** Splitting revenue among many small holders off-chain means trusting whoever does the math and sends the money.
- **AXEL:** `deposit_revenue` moves SOL into a revenue vault PDA and records a `RevenuePeriod` with `token_supply_snapshot` = shares sold at that moment. `claim_revenue` pays `balance × deposited / snapshot` (u128 math, rounded down) from the vault, which only the program can sign for. A `ClaimRecord` PDA per period and wallet blocks a second claim.
- **Gap:** the payout uses the claimant's current balance, so shares bought or transferred after a deposit can still claim that period.

All open gaps are listed in [Status and Known Limitations](#status-and-known-limitations).

---

## Why Solana

- **Token-2022 extensions natively.** One `initialize_project` instruction configures six mint extensions: TransferHook, DefaultAccountState, PermanentDelegate, TransferFeeConfig (1%), MetadataPointer and TokenMetadata. The compliance rules and the car's VIN, make, model, year and valuation live in the token itself, with no custom token program.
- **Transfer-hook composability.** Token-2022 invokes the hook on every `transfer_checked`, whichever wallet or program moves the shares. The whitelist check is part of the token, not of the AXEL UI.
- **Low fees for per-period claims.** Each holder claims each period in a transaction of its own, or several periods at once with "Claim all". A claim costs the 5,000-lamport base fee plus rent for a 10-byte `ClaimRecord`.
- **Wallet adapter.** Solana Wallet Adapter connects Phantom and Solflare. The frontend reads program accounts directly over RPC with the Anchor IDL, so no server keeps a copy of business state.

---

## Summary of Features

**Investor**
- Landing page and catalog of every project read from the `axel` program: live figures from the chain (cars listed, shares sold, payout periods), Token-2022 metadata, and a status filter once cars differ in status
- Asset page: VIN, sale progress, price, remaining shares, Solana Explorer links for the mint, the revenue vault, the operator and the oracle, and a buy flow (`buy_tokens`). The buy button reads the wallet's `WhitelistEntry` first and says why it is disabled.
- Per-car payout history, a payout calculator that works only on the reader's own numbers, and the trip-data (telemetry) widget
- Dashboard: holdings, revenue periods with claimed / claimable status, per-period claim and "Claim all" (several `claim_revenue` instructions in one transaction)
- Payout history across all holdings

**Admin**
- `/admin` panel, shown only to the admin wallet of the first project: metrics, whitelist manager (add / remove), revenue deposit form (gross − expenses − reserve, in SOL), pause / resume / close
- `npm run init-project` creates a project: a Token-2022 mint with six extensions and metadata, plus its `ProjectState`
- `update_price` and `revoke_mint_authority` are available on-chain; they have no UI yet

**Telemetry and KYC backend (NestJS, SQLite for KYC state)**
- `GET /health`, `GET /telemetry/latest/:projectId`, `GET /kyc/nonce`, `POST /kyc/session`, `POST /kyc/webhook` ([docs/api.md](docs/api.md#backend-http-endpoints))
- Daily cron that fetches the previous day's completed Yandex Fleet orders for the car's licence plate, aggregates revenue, mileage and trips, and hashes them with SHA-256; the schedule comes from `CRON_SCHEDULE`
- Wallet binding: the wallet signs a Sign-In With Solana message with a single-use nonce, and only then gets a Sumsub WebSDK token for an applicant bound to it
- Sumsub webhook: HMAC over the raw body with the algorithm Sumsub names, compared in constant time; approvals confirmed with the Sumsub API; v2 `set_investor` (Active for 12 months, or Revoked) built from the IDL and signed by a dedicated KYC key; nothing sent when the record would not change; a sanctions freeze is never touched
- Refuses to start in production without the webhook secret, the Sumsub credentials, the KYC key, the program ID and the allowed origins; CORS limited to `CORS_ORIGINS`; rate limits on the sign-in endpoints
- 151 Jest tests with the Solana RPC and the Sumsub API replaced at their boundaries

**Frontend**
- Next.js 14 App Router; transactions are built from the vendored IDL (`frontend/src/lib/solana/idl/`)
- English (default), Russian and Kazakh via `next-intl`: `/`, `/ru/…`, `/kk/…`
- Security headers: Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy
- Self-hosted fonts and a credited, licensed photo set; design rules in [`frontend/design.md`](frontend/design.md)
- Vitest unit suite: 45 files, 206 tests, run in CI

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| On-chain programs | Rust 1.89.0 · Anchor 0.32.1 (`anchor-lang`, `anchor-spl`) · `spl-token-2022` 8 · `spl-transfer-hook-interface` 0.9 · `spl-tlv-account-resolution` 0.9 · `spl-token-metadata-interface` 0.7 |
| Token standard | SPL Token-2022: TransferHook, DefaultAccountState, PermanentDelegate, TransferFeeConfig, MetadataPointer, TokenMetadata |
| Program tests | `node:test` + `tsx` · `@coral-xyz/anchor` · `@solana/spl-token` 0.4 against a local validator (12 files, 49 tests) |
| Client SDK | Codama (`npm run generate` → `sdk/axel-v2`, the v2 program) |
| Frontend | Next.js 14.2 · React 18.3 · TypeScript 5 · Tailwind CSS 3.4 · `@coral-xyz/anchor` 0.32.1 · `@solana/web3.js` 1.98 · `@solana/spl-token` 0.4.14 · Solana Wallet Adapter (Phantom, Solflare) · `next-intl` 4.8 · React Hook Form 7 + Zod 3 |
| Frontend tests | Vitest 3.2 · Testing Library · jsdom |
| Backend | NestJS 11 · `@nestjs/schedule` 5 · `@nestjs/config` 4 · `@nestjs/throttler` 6 · `better-sqlite3` 12 · `@solana/web3.js` 1.98 · `@coral-xyz/anchor` 0.32.1 · Jest 29 + Supertest · ESLint 10 + typescript-eslint |
| External services | Yandex Fleet API (telemetry source) · Sumsub (WebSDK tokens, applicant API, webhook) |
| CI | GitHub Actions: frontend lint, typecheck, unit tests and build; backend lint, tests and build; programs build, Rust and LiteSVM tests, IDL and SDK freshness |
| AI tools | Claude Code (coding assistant) · Google Stitch (UI drafts) |

---

## Architecture

```
            Investor / admin wallet (Phantom or Solflare, devnet)
                                  │ signs transactions
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Frontend · Next.js 14                                     frontend/ │
│ catalog · asset page · dashboard · payouts · admin panel            │
│ reads program accounts over RPC with the vendored Anchor IDL        │
└───────────┬───────────────────────────────────────┬─────────────────┘
            │ RPC reads + signed transactions       │ GET /telemetry/latest/:mint
            ▼                                       ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│ Solana devnet                   │    │ Backend · NestJS 11    backend/ │
│                                 │    │ SQLite for KYC state            │
│ axel program · 12 instructions  │    │ telemetry cron    (off-chain)   │◄── Yandex Fleet API
│   ProjectState  RevenuePeriod   │    │ KYC sign-in, webhook → v2 only  │◄── Sumsub webhook
│   ClaimRecord   WhitelistEntry  │    └─────────────────────────────────┘
│   TelemetryRecord · vault PDA   │
│                                 │
│ Token-2022 mint (one per car)   │
│   6 extensions, VIN metadata    │
│          │ on transfer_checked  │
│          ▼                      │
│ transfer_hook program           │
│   both owners whitelisted?      │
└─────────────────────────────────┘
```

**Flow**

1. **`initialize_project`** (admin, via `npm run init-project`): creates the Token-2022 mint (0 decimals, six extensions, metadata with VIN, make, model, year and valuation) and the `ProjectState` PDA. The mint and freeze authorities are that PDA. No shares exist yet.
2. **KYC:** on v1 the admin approves a wallet by hand. The backend's Sumsub flow writes v2 KYC records instead ([docs/architecture.md](docs/architecture.md#kyc-flow-v2)).
3. **Whitelist:** the admin panel calls `add_to_whitelist(wallet)`, which creates `WhitelistEntry { approved: true }` at `["whitelist", wallet]`.
4. **`buy_tokens(n)`:** requires the buyer's approved `WhitelistEntry`. It sends `n × price_per_share` lamports to the admin. On a first purchase it creates the buyer's token account and thaws it (accounts start frozen), then mints `n` shares.
5. **`deposit_revenue(period, amount)`** (admin): moves `amount` lamports into the revenue vault PDA and creates a `RevenuePeriod` with `token_supply_snapshot` = shares sold at that moment.
6. **`claim_revenue(period)`** (holder): pays `balance × total_deposited / snapshot` from the vault and creates a `ClaimRecord` that blocks a second claim.
7. **Holder-to-holder transfers:** Token-2022 calls `transfer_hook` on every `transfer_checked`. The hook requires an approved `WhitelistEntry` for both owners, and Token-2022 withholds a 1% transfer fee, in shares.
8. **`record_telemetry(date, hash)`** (oracle): stores the SHA-256 hash of a day's Yandex Fleet figures in a `TelemetryRecord` PDA, one per project per day. The backend's daily job does not send it yet.

Full breakdown with every PDA seed, instruction precondition and account layout: [docs/architecture.md](docs/architecture.md). HTTP endpoints and the instruction reference: [docs/api.md](docs/api.md).

---

## On-chain Deployment (Solana devnet)

| Account | Address | Details |
|---------|---------|---------|
| `axel` program | [`DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`](https://explorer.solana.com/address/DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M?cluster=devnet) | 12 instructions, 5 account types |
| `transfer_hook` program | [`5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`](https://explorer.solana.com/address/5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ?cluster=devnet) | Whitelist check on every share transfer |
| Project 1 · `ProjectState` | [`FcETyegc5PindjcQ67dLUkzfg2XSFpJ5s2XHLj2ANEMR`](https://explorer.solana.com/address/FcETyegc5PindjcQ67dLUkzfg2XSFpJ5s2XHLj2ANEMR?cluster=devnet) | Active · 7 / 100 shares sold · 0.1 SOL per share · 1 revenue period |
| Project 1 · mint | [`CEBjRiHfzycVPjXmD4xJbsg7gCQokyzEAigfEQbZqFK8`](https://explorer.solana.com/address/CEBjRiHfzycVPjXmD4xJbsg7gCQokyzEAigfEQbZqFK8?cluster=devnet) | Token-2022, 0 decimals, 6 extensions, 1% transfer fee |
| Project 2 · `ProjectState` | [`BfTeR9NTwrgh9Z24vEK339yoZfVKbpmtXgNH9zKyQnyG`](https://explorer.solana.com/address/BfTeR9NTwrgh9Z24vEK339yoZfVKbpmtXgNH9zKyQnyG?cluster=devnet) | Active · 13 / 100 shares sold · 0.1 SOL per share · 1 revenue period |
| Project 2 · mint | [`Aj9qpbVQexrpp6HZojWuyq3s4W7ymTRpQ7uudZgz37YU`](https://explorer.solana.com/address/Aj9qpbVQexrpp6HZojWuyq3s4W7ymTRpQ7uudZgz37YU?cluster=devnet) | Token-2022, 0 decimals, 6 extensions, 1% transfer fee |

Both projects were created by `scripts/init-project.ts` and carry its **test metadata**: "Axel Taxi #001", Toyota Camry 2023, VIN `XTA210990Y2856777`, valuation 10 SOL. They are not backed by a real vehicle.

Project 1's full lifecycle on devnet, recorded on 2026-04-07 (before the hackathon):

| Step | Transaction |
|------|-------------|
| `initialize_project` | [`3z8Lmn…7wnegL`](https://explorer.solana.com/tx/3z8LmnXpmZc6tsJGt7j8kpXXQYN2LDZjJHNghJHzYdaivY8t3wTzLN5qV3qVKXFG3gW5ydGixStoCmtVX87wnegL?cluster=devnet) |
| `add_to_whitelist` | [`3QDYsv…Fg27ne`](https://explorer.solana.com/tx/3QDYsvxtxBRv5SSnt2HujVHyb6vGxuUy6VxEjiUNV6YYQqvRAaaGab84G97prBhriuFa6TiMnuAUu3UsrmFg27ne?cluster=devnet) |
| `buy_tokens` (creates, thaws and mints to the buyer's account) | [`3aDuzJ…W4LSD1`](https://explorer.solana.com/tx/3aDuzJzDPuDnxR7XRsXwKyymXcA1sBuUNr4ssMjbD2S1PnzQmRFdiTTbtcJ7x4myAZmwmM5scuf5ZjpXDXW4LSD1?cluster=devnet) |
| `deposit_revenue` | [`bGgP9V…t3MMmS`](https://explorer.solana.com/tx/bGgP9VLqUjiFjrxm5MiRitG3mWGx3fcfTvrFzJKnWs8th8uy7zDyidvQ3D4iTPBDhEKmMHYAnDViHpBd9t3MMmS?cluster=devnet) |
| `claim_revenue` | [`2A6UKZ…PRAchf`](https://explorer.solana.com/tx/2A6UKZp1i6LFyjv8gNSy1Qgej12me6C4Juq9nuMsn7s3YHpKRkfa8Pjdy3dj6qmdgJoiiSQzqg1CfLTnfEPRAchf?cluster=devnet) |

No `TelemetryRecord` exists on devnet yet, and no holder-to-holder transfer has been made (see below).

### Status and Known Limitations

AXEL is an MVP on **devnet only**. The programs are **not audited**, and there is no mainnet deployment. The most important open issues, all from reading the code (full list of 11: [docs/architecture.md](docs/architecture.md#known-limitations)):

- `add_to_whitelist` and `remove_from_whitelist` accept **any signer**, so the KYC gate is not enforced on-chain until they are restricted to an authorized key.
- `claim_revenue` pays on the **current** balance, so shares bought or transferred after a deposit can claim that period again.
- Neither devnet mint has the hook's `ExtraAccountMetaList`, so holder-to-holder transfers fail today. Primary sales are mints, not transfers, so they are unaffected.
- The backend writes no telemetry on-chain yet. Without Yandex Fleet credentials it serves simulated telemetry, and does not mark it as simulated.
- The telemetry widget on the asset page is not connected to the backend. The UI has no KYC flow yet; on v1, wallets are approved from the admin panel, and the backend's Sumsub flow writes v2 records.
- Car photos are stock photos of the model, marked "Illustrative photo" on the page.

Security reports: [SECURITY.md](SECURITY.md).

---

## Screenshots

Both screenshots show live devnet data in the English locale.

| Catalog | Asset page |
|---------|------------|
| ![The fleet: both devnet projects with price per share, payout periods and sale progress](assets/screenshots/01-catalog.png) | ![Asset page for mint Aj9q…37YU with VIN, 13 of 100 shares sold, the purchase panel and Explorer links](assets/screenshots/02-asset-detail.png) |

---

## Quick Start

**Prerequisites**
- Node.js 22 LTS and npm. The frontend and backend need Node >= 20.19 (CI uses Node 20); the root program tests need Node >= 21.
- Phantom or Solflare switched to **Devnet**, for anything that signs a transaction. Browsing needs no wallet.
- For the programs only: Rust 1.89.0 (pinned in `rust-toolchain.toml`), Anchor CLI 0.32.1, and the Solana (Agave) CLI 2.3.x, tested with 2.3.13. `Cargo.lock` needs Cargo 1.85+ inside the SBF toolchain, so platform-tools v1.52 is pinned in the root `Cargo.toml` (`[workspace.metadata.solana]`).

```bash
git clone https://github.com/dmitriytsoy22/axel-sol.git
cd axel-sol
```

Each block below starts from the repository root.

**Frontend** (reads the live devnet programs; the IDL is vendored, so no Anchor toolchain is needed)

```bash
cd frontend
cp .env.local.example .env.local   # devnet RPC and program ID are prefilled
npm ci
npm run dev                         # http://localhost:3000
```

Checks, as run in CI: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.

Buying shares requires a wallet with an approved `WhitelistEntry` on devnet. A public demo path for judges is planned (see below).

**Backend** (optional: telemetry and KYC)

```bash
cd backend
cp .env.example .env                # every variable is documented in the file
npm ci
npm run start:dev                   # watch mode; or: npm run build && npm run start:prod
curl http://localhost:3001/health   # {"status":"ok","rpc":"connected","kyc":"not_configured"}
```

Checks, as run in CI: `npm run lint`, `npm test`, `npm run build`.

Without Yandex Fleet credentials the telemetry job uses simulated data. Without `KYC_AUTHORITY_KEYPAIR_PATH`, `SUMSUB_WEBHOOK_SECRET` and the Sumsub API credentials the KYC endpoints answer 503; with `NODE_ENV=production` the backend does not start without them.

**Programs**

```bash
npm ci
npm run build                               # anchor build → target/deploy, target/idl, target/types
anchor test --provider.cluster localnet     # v1: starts a local validator with the programs, runs the test script
cargo test -p axel-v2                       # v2: math, dates, telemetry chain, account layouts
npm run test:v2                             # v2: the program on LiteSVM, no validator needed
```

`npm test` runs `node --import tsx/esm --test tests/**/*.ts` against a validator at `http://127.0.0.1:8899`. `Anchor.toml` sets the provider cluster to devnet, so always pass `--provider.cluster localnet`. To create a v1 project on a cluster: `npm run init-project -- --cluster devnet` (admin = `~/.config/solana/id.json`). CI builds all programs and runs the v2 Rust and LiteSVM tests (530); the v1 tests (49) need a local validator and run locally only.

More detail: [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Repository Structure

```
axel-sol/
├── programs/
│   ├── axel/src/
│   │   ├── lib.rs                  # program entry, 12 instructions
│   │   ├── errors.rs               # AxelError
│   │   ├── state/                  # ProjectState, RevenuePeriod, ClaimRecord, WhitelistEntry, TelemetryRecord
│   │   └── instructions/
│   │       ├── admin/              # initialize_project, whitelist, deposit_revenue, pause_resume,
│   │       │                       # update_price, revoke_mint_authority, close_project
│   │       ├── investor/           # buy_tokens, claim_revenue
│   │       └── oracle/             # record_telemetry
│   ├── transfer-hook/src/lib.rs    # execute, fallback, initialize_extra_account_meta_list
│   └── axel-v2/src/                # v2: escrowed raise, KYC registry, transfer hook, attested revenue, recovery (docs/v2.md)
├── tests/                          # 12 node:test files for both programs (local validator)
├── tests-v2/                       # v2 program tests on LiteSVM
├── scripts/                        # init-project.ts, generate-clients.ts, last-project.json
├── sdk/axel-v2/                    # Codama TypeScript client of the v2 program (docs/v2.md)
├── migrations/deploy.ts            # Anchor scaffold, unused
├── backend/src/                    # NestJS: health, kyc, telemetry, yandex, solana modules
├── frontend/
│   ├── src/app/[locale]/           # /, /assets/[id], /dashboard, /payouts, /admin
│   ├── src/components/             # admin, asset, catalog, dashboard, invest, layout, payouts, shared, ui, wallet
│   ├── src/hooks/                  # chain reads and transaction hooks
│   ├── src/lib/solana/             # connection, PDAs, readers, instruction builders, idl/ and idl-v2/ (vendored)
│   ├── src/fonts/, public/images/  # self-hosted fonts; car and city photos with credits
│   ├── messages/                   # en.json, ru.json, kk.json
│   └── design.md                   # design direction, tokens and page rules
├── docs/                           # product, architecture, api, v2, roadmap; planning/ and ru/ (historical)
├── assets/                         # logo, hero, screenshots
├── .github/workflows/ci.yml        # frontend, backend and programs CI
├── Anchor.toml · Cargo.toml · rust-toolchain.toml · package.json
└── LICENSE · CONTRIBUTING.md · SECURITY.md
```

---

## Prior Work and Hackathon Scope

AXEL was started before Crypto World's Fair. Only work done during the event is judged, so the boundary is marked in git with the tag **`pre-hackathon`** (commit `cd2c12c`, 2026-04-07).

**Before the hackathon (Mar 28 – Apr 7, 2026)**
- Written by two people:
  - Dmitriy Tsoy: frontend, 36 commits.
  - Andrey S ([@ndrkbrg](https://github.com/ndrkbrg)): Anchor programs, backend and chain integration, 22 commits.
- Scope: the specification and plans, both Anchor programs and their integration tests, the devnet deployment with the two test projects above, the NestJS backend, and the Next.js frontend wired to the program.
- An AXEL project draft was created on Colosseum for the Frontier hackathon (spring 2026). It was never submitted.
- `main` has no commits between 2026-04-07 and 2026-09-24.

**During Crypto World's Fair (from Sep 14, 2026)**

Everything after the tag: [`pre-hackathon...main`](https://github.com/dmitriytsoy22/axel-sol/compare/pre-hackathon...main).

Done so far:
- Vendored the program IDL into `frontend/src/lib/solana/idl/`, so a fresh clone builds without `anchor build`, and fixed the Content-Security-Policy for local development.
- Brought the frontend unit suite to green (31 files, 105 tests). Five stale test files were rewritten against the current code, and a leftover 800 ms mock delay was removed from `useTelemetry`.
- Added real CI: [`.github/workflows/ci.yml`](.github/workflows/ci.yml).
- Wrote the English documentation: [product](docs/product.md), [architecture](docs/architecture.md), [API](docs/api.md), [roadmap](docs/roadmap.md). The historical plans moved to [docs/planning/](docs/planning/) and the Russian overview to [docs/ru/](docs/ru/).
- Added repository assets (logo, hero image, screenshots of the live devnet data), [LICENSE](LICENSE), [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).
- Cleaned up the env examples and removed a committed local tool-settings file and a duplicate image.
- Pinned the SBF platform-tools in `Cargo.toml` so `anchor build` works with the current lockfile, and re-ran the program test suite on a local validator (49 tests pass).
- Added missing asset-page translations (EN / RU / KK).
- Rewrote this README to match the code.
- Moved the backend's KYC to v2: wallet sign-in with a single-use nonce, Sumsub sessions bound to that wallet in SQLite, and a webhook that checks the HMAC properly and signs idempotent `set_investor` calls with a dedicated KYC key. Also CORS, rate limits, startup checks, ESLint and 151 Jest tests. See [docs/api.md](docs/api.md#backend-http-endpoints).
- Wrote the AXEL v2 program (`programs/axel-v2`, 24 instructions): escrowed fundraising with refunds, a KYC registry with restricted signers, a transfer hook inside the program, attested revenue deposits with claims that are safe against transfers and late buys, a telemetry hash chain and time-locked share recovery. It has 35 Rust tests and 530 LiteSVM tests, a generated client in `sdk/axel-v2`, and CI. Design: [docs/v2.md](docs/v2.md). It is not deployed yet.
- Redesigned the frontend ([`frontend/design.md`](frontend/design.md)): new landing page, asset, portfolio, payouts and operator pages, self-hosted fonts, licensed photos, and pages checked for layout, contrast and accessibility at five widths in EN / RU / KK. The asset page no longer shows made-up specs or income projections.

In progress during the hackathon (**planned, not done yet**):
- [ ] Public frontend deployment with a judge demo path (a whitelisted devnet test wallet)
- [ ] End-to-end devnet demo with Explorer links: whitelist → buy → deposit → claim → transfer
- [ ] Deploy AXEL v2 under its new program ID (written and tested locally, see above)
- [ ] Move the frontend to v2: stablecoin prices, the new project states, KYC sign-in and records, recovery alerts; and the backend's telemetry to v2 batches

---

## Roadmap

- [x] `axel` Anchor program with 12 instructions: project setup, whitelist, direct sale, revenue deposit and claim, pause / resume / close, telemetry, price update, mint-authority revoke
- [x] Token-2022 share mint with six extensions and on-chain car metadata
- [x] `transfer_hook` program that checks both owners against the whitelist
- [x] Program integration tests (12 files, 49 tests, local validator)
- [x] Both programs on devnet; two test projects that each went through whitelist → buy → deposit → claim
- [x] NestJS backend: health, telemetry endpoint, KYC webhook, Yandex Fleet cron
- [x] Next.js frontend: catalog, asset page and buy, dashboard with claim, payouts, admin panel, EN / RU / KK
- [x] Vendored IDL, green frontend unit suite, CI, English docs
- [x] AXEL v2 program with its tests and TypeScript client (not deployed)
- [x] Frontend redesign
- [x] Program build and v2 tests in CI (the v1 tests run locally only)
- [ ] Public deployment and judge demo path
- [ ] End-to-end devnet demo, including a holder-to-holder transfer
- [ ] Restrict `add_to_whitelist` / `remove_from_whitelist` to an authorized key
- [ ] Revenue claims that ignore shares bought or transferred after a deposit
- [ ] Create the hook's `ExtraAccountMetaList` during project setup
- [ ] Send telemetry from the backend as v2 `record_telemetry` batches and flag simulated telemetry
- [ ] Connect KYC and the telemetry widget in the UI
- [ ] Independent security audit, multisig authorities, mainnet

Full roadmap: [docs/roadmap.md](docs/roadmap.md)

---

## Resources

- [Documentation index](docs/README.md)
- [Colosseum project page](https://colosseum.com/arena/projects/axel-1)
- [Contributing](CONTRIBUTING.md) · [Security policy](SECURITY.md)
- Logo: [assets/logo.png](assets/logo.png) · [assets/logo-wordmark.png](assets/logo-wordmark.png)

---

## Acknowledgements

- **Andrey S ([@ndrkbrg](https://github.com/ndrkbrg))** wrote the Anchor programs, the NestJS backend and the chain integration of the frontend before the hackathon.

---

## License

MIT — see [LICENSE](LICENSE)
