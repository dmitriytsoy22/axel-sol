# AXEL — Tokenized Taxi Cars on Solana

[![CI](https://github.com/dmitriytsoy22/axel-sol/actions/workflows/ci.yml/badge.svg)](https://github.com/dmitriytsoy22/axel-sol/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-14F195.svg)](LICENSE)
[![Solana](https://img.shields.io/badge/Solana-devnet-9945FF)](https://explorer.solana.com/address/DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M?cluster=devnet)
[![Colosseum](https://img.shields.io/badge/Colosseum-Crypto%20World%27s%20Fair%202026-14F195)](https://colosseum.com/arena/projects/axel-1)

> Fractional ownership of taxi cars on Solana: each car is a Token-2022 mint, shares are sold only to KYC-verified wallets, and the car's revenue is paid out pro-rata by an Anchor program.

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
- **v2 backend:**
  - The backend publishes each car's daily record (trips, km, the rent the park charged, and whether the data is real or simulated) as RFC 8785 JSON.
  - As the project's oracle, it appends each record's hash to the v2 program's telemetry chain.
  - It co-signs a revenue deposit only when the report behind it adds up from those published days, and the report's hash is stored with the deposit.
- **Gaps:**
  - On v1 the admin chooses the deposited amount, and nothing checks it.
  - v2 is not deployed, so no telemetry hash is on devnet yet.
  - The oracle is one backend key, and the Yandex Fleet requests have not been run against a real park.

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

The frontend runs on the v2 program, `axel_v2`, which is not deployed yet (see [Quick Start](#quick-start) for a local chain); the v1 `axel` program below is what devnet runs.

**Investor** (frontend, `axel_v2`)
- Landing page and catalog of every project: live figures from the chain (cars listed, shares sold, value sold per payment token, deposits), the car from its share mint's metadata, and filters by state, city and class
- Asset page: state, price in the payment token (tKZT, USDC), raise progress with a soft-cap marker and a countdown, the escrow balance read live, a timeline of the project's states, fees, holders and Explorer links (share mint, payment mint, escrow, revenue vault, operator, oracle), and a buy flow (`buy_shares` into escrow) whose dialog explains the escrow, the refund rule and any power the stablecoin's issuer holds. The buy button reads the wallet's KYC record and says why it is disabled; anyone can settle a raise whose outcome is certain; a holder of a failed raise gets a refund, which settles the raise first when nobody has.
- "Check the car's data yourself": the browser downloads the car's published telemetry, income reports and purchase papers, hashes them with WebCrypto over RFC 8785 JSON, rebuilds the telemetry hash chain and compares every fingerprint with the chain
- Proof of solvency page: for every car, live, the income vault against deposited − claimed and what holders are owed now, the escrow against sold × price, the share supply against the ledger, and the revenue checkpoints
- Per-car deposit history with the amount per share, a payout calculator on the reader's own numbers, and the trip-data (telemetry) widget
- Portfolio: a pending recovery of the wallet's shares with a veto, value, shares, and exactly what a claim pays now (the program's accumulator math on BigInt); claim per car or "Claim all" (four cars per transaction), refunds, and sending shares to another verified wallet (the recipient's KYC is checked while typing; the transfer lists the hook's accounts itself and onboards a first-time recipient)
- Payout history: deposits of the wallet's cars from the chain, or its part of each deposit and its claims from an indexer
- Every transaction outcome in a toast with an Explorer link; every program error explained in EN / RU / KK
- Judge demo path (`/demo`, devnet only): sign a message to get a demo KYC record, 50,000 test tenge and 0.01 SOL; buy in an open raise; receive shares of an operating car from the desk; simulate a month of income (the operator's deposit, co-signed by the car's oracle); claim; verify the car's data; proof of solvency. Rate-limited per wallet, per IP address and in total (Upstash Redis), with optional Cloudflare Turnstile
- Solana Actions (Blinks): invest in a car's open raise or claim its payout from a post on X or Telegram; `actions.json` makes a car page unfurl into its invest Blink

**Admin** (frontend console, roles read from the chain)
- One console split by the keys the wallet holds
- Platform admin (`Config.admin`): every car's state (settle a raise, release it to the operator with the purchase documents' hash, cancel it, pause, resume, close), its operator and oracle, share recovery (propose, run, withdraw), and the config account
- Operator: its cars' deposits, keys, live income vault and payout history
- KYC key and devnet demo KYC key: look a wallet's record up, then approve or revoke it (`set_investor`)
- A "devnet demo data, generated by scripts/seed-devnet" banner on every page of a test-network deployment
- v1: `npm run init-project` creates a project (a Token-2022 mint with six extensions and metadata, plus its `ProjectState`)

**Oracle, telemetry, KYC and event-index backend (NestJS, SQLite)**
- Endpoints ([docs/api.md](docs/api.md#backend-http-endpoints)):
  - `GET /health`;
  - telemetry: `GET /telemetry/latest/:mint`, `/telemetry/:mint/:date.json`, `/telemetry/:mint/proof`, `/telemetry/:mint/chain`;
  - reports: `POST /reports/draft`, `POST /reports/attest`, `GET /reports/:mint`, `/reports/:mint/:hash.json`;
  - KYC: `GET /kyc/nonce`, `POST /kyc/session`, `POST /kyc/webhook`;
  - program events: `GET /events`, `/projects/:mint/history`, `/positions/:owner/claims`.
- Several cars from `FLEET_CONFIG` (share mint → plate, source, park fee). The daily job fills in every missed day, up to 31 back.
  - Real cars: trips and km come from Yandex Fleet orders, and the rent from the park's charges to the car's drivers.
  - Simulated cars: a deterministic generator. Every record says `data_origin: "simulated"`, there is no silent fallback, and mainnet refuses them.
- Each day is published as RFC 8785 JSON, hashed with SHA-256, stored in SQLite, and appended to the v2 chain with `record_telemetry` (20 days per transaction, oracle key). A crash between sending and confirming is reconciled on the next run.
- Revenue reports: rent − park fee − maintenance − insurance (plus sale proceeds in a final report), with the telemetry head.
  - Before adding the oracle's signature, the backend rebuilds the report and checks the operator-signed `deposit_revenue`.
  - The transaction may hold only that deposit, its arguments must match the report, and no earlier deposit may overlap the period.
- Wallet binding: the wallet signs a Sign-In With Solana message with a single-use nonce, and only then gets a Sumsub WebSDK token for an applicant bound to it
- Sumsub webhook: HMAC over the raw body with the algorithm Sumsub names, compared in constant time; approvals confirmed with the Sumsub API; v2 `set_investor` (Active for 12 months, or Revoked) built from the IDL and signed by a dedicated KYC key; nothing sent when the record would not change; a sanctions freeze is never touched
- Refuses to start in production without the webhook secret, the Sumsub credentials, the KYC key, the program ID and the allowed origins; CORS limited to `CORS_ORIGINS`; rate limits on the sign-in endpoints
- Event indexer: the v2 program's history (`getSignaturesForAddress`, `getTransaction`) stored in SQLite oldest first with a cursor, a `logsSubscribe` websocket that brings new events in at once, retries with backoff, and events the transfer hook emits inside Token-2022 kept. It halts rather than mix two clusters in one database.
- Jest tests with the Solana RPC, the Sumsub API and the Yandex Fleet API replaced at their boundaries; the fake RPC applies `set_investor` and `record_telemetry` the way the program does. `npm run test:localnet` runs the indexer against `solana-test-validator` with the built `axel_v2.so`.

**Frontend**
- Next.js 14 App Router; transactions are built from the vendored v2 IDL (`frontend/src/lib/solana/idl-v2/`); cluster, RPC, program ID, telemetry API and indexer come from the environment
- English (default), Russian and Kazakh via `next-intl`: `/`, `/ru/…`, `/kk/…`
- Security headers: Content-Security-Policy, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy
- Self-hosted fonts and a credited, licensed photo set; design rules in [`frontend/design.md`](frontend/design.md)
- Vitest unit suite: 68 files, 510 tests, run in CI. The client is tested without mocks against the IDL, `@solana/spl-token`'s hook resolver, and accounts the real program wrote in LiteSVM

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
│ catalog · asset page · dashboard · payouts · solvency · admin       │
│ reads program accounts over RPC with the vendored Anchor IDL        │
└───────────┬───────────────────────────────────────┬─────────────────┘
            │ RPC reads + signed transactions       │ HTTP /telemetry, /reports
            ▼                                       ▼
┌─────────────────────────────────┐    ┌─────────────────────────────────┐
│ Solana devnet                   │    │ Backend · NestJS 11    backend/ │
│                                 │    │ SQLite: KYC, days, reports      │
│ axel program · 12 instructions  │    │ telemetry job → v2 chain        │◄── Yandex Fleet API
│   ProjectState  RevenuePeriod   │    │ deposit attestation (oracle)    │
│   ClaimRecord   WhitelistEntry  │    │ KYC sign-in, webhook → v2 only  │◄── Sumsub webhook
│   TelemetryRecord · vault PDA   │    └─────────────────────────────────┘
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
8. **`record_telemetry(date, hash)`** (oracle): stores the SHA-256 hash of a day's Yandex Fleet figures in a `TelemetryRecord` PDA, one per project per day. The backend does not write v1 telemetry. It writes to the v2 hash chain instead ([docs/architecture.md](docs/architecture.md#oracle--telemetry-flow)).

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
- The backend writes telemetry and co-signs deposits only for v2, which is not deployed. Its Yandex Fleet requests have not been run against a real park; simulated days are marked `data_origin: "simulated"`.
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

**Frontend** (runs on `axel_v2`; the IDL is vendored, so building needs no Anchor toolchain)

v2 is not on devnet yet, so on devnet the catalog is empty. To see cars, start a local validator with the program and a small market (three cars, deposits, holders) that the program itself produced in LiteSVM, then point the app at it:

```bash
npm ci && npm run build                        # anchor build: target/deploy/axel_v2.so
npm --prefix tests-v2 ci
npm --prefix tests-v2 run fixture-validator    # solana-test-validator on 127.0.0.1:8899

cd frontend
cp .env.local.example .env.local
# in .env.local: NEXT_PUBLIC_SOLANA_NETWORK=localnet and NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
npm ci
npm run dev                                    # http://localhost:3000
```

That chain is for reading: its wallets have no saved keys, and it has no telemetry, so "Check the car's data yourself" has nothing to verify on it. The demo seed (`scripts/seed-devnet`, once merged) fills a local validator with every project state, telemetry and a pending recovery, and publishes the files the check reads; serve its `--data-dir` and set `NEXT_PUBLIC_PUBLISHED_DATA_URL` to it, and `NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS=<tKZT mint>:tKZT`. Every variable is described in [docs/api.md](docs/api.md#frontend-environment).

To run the judge demo routes on that seeded chain, set `NEXT_PUBLIC_DEMO_ACCESS=1` and the demo keys the seed derived (`DEMO_SEED_SECRET=… node scripts/demo-env.mjs --cluster localnet --fleet <demo.demo_fleet>` in `frontend/` prints them), fund the faucet key it prints (`solana airdrop` on a local validator), and open `/demo`. The routes and Blinks are described in [docs/api.md](docs/api.md#judge-demo-api).

Checks, as run in CI: `npm run lint`, `npx tsc --noEmit`, `npx vitest run`, `npm run build`.

**Backend** (optional: telemetry, KYC and event history)

```bash
cd backend
cp .env.example .env                # every variable is documented in the file
npm ci
npm run start:dev                   # watch mode; or: npm run build && npm run start:prod
curl http://localhost:3001/health   # {"status":"ok","rpc":"connected","kyc":"not_configured","oracle":"not_configured","indexer":"live"}
```

Checks, as run in CI: `npm run lint`, `npm test`, `npm run build`. With the Agave toolchain on PATH and `anchor build` done, `npm run test:localnet` also runs the event indexer against a local validator.

- **Cars** come from `FLEET_CONFIG`. A `simulated` car needs no credentials and is published with `data_origin: "simulated"`. A `yandex_fleet` car needs the `YANDEX_*` credentials.
- **Oracle key.** Without `ORACLE_KEYPAIR_PATH`, days are still published, but nothing is written on-chain and `/reports/attest` answers 503.
- **KYC.** Without `KYC_AUTHORITY_KEYPAIR_PATH`, `SUMSUB_WEBHOOK_SECRET` and the Sumsub API credentials, the KYC endpoints answer 503.
- **Production.** With `NODE_ENV=production` the backend does not start without the KYC settings, or without the oracle key when cars are configured.
- **Event history.** The indexer reads `SOLANA_RPC_URL` (or `INDEXER_RPC_URL`) and its websocket. The SQLite file belongs to one cluster; after resetting a local validator, use a new `DATABASE_PATH`. `INDEXER_ENABLED=false` turns it off.

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
├── tests-v2/                       # v2 program tests on LiteSVM; scripts/ exports the frontend fixture and runs it on a local validator
├── scripts/                        # init-project.ts, generate-clients.ts, last-project.json
├── sdk/axel-v2/                    # Codama TypeScript client of the v2 program (docs/v2.md)
├── migrations/deploy.ts            # Anchor scaffold, unused
├── backend/src/                    # NestJS: health, kyc, fleet, telemetry, reports, indexer, solana modules
├── frontend/
│   ├── src/app/[locale]/           # /, /assets/[id], /dashboard, /payouts, /solvency, /demo, /admin
│   ├── src/app/api/                # demo/ (judge demo routes, devnet only) and actions/ (Blinks); app/actions.json
│   ├── src/components/             # admin, asset, catalog, dashboard, demo, invest, layout, payouts, shared, solvency, ui, wallet
│   ├── src/hooks/                  # chain reads and transaction hooks
│   ├── src/lib/solana/             # axel_v2 client: config, PDAs, readers, math, instructions, errors, idl-v2/ (vendored)
│   ├── src/lib/demo/, lib/actions/ # demo keys, limits, tokens and transactions; Solana Actions handlers
│   ├── scripts/demo-env.mjs        # prints the demo routes' keys for a cluster the seed filled
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
- Made the backend the v2 oracle:
  - several cars, with the rent model, and simulated data marked as such;
  - RFC 8785 daily records published from SQLite, with a proof endpoint;
  - `record_telemetry` batches that survive a crash between sending and confirming;
  - revenue reports, and a deposit co-signature given only when the operator's report matches the published days.

  Checked against the real `axel_v2.so` in LiteSVM: the chain head and the deposit's `report_hash` match. See [docs/architecture.md](docs/architecture.md#oracle--telemetry-flow).
- Added a backend event indexer for v2: program history plus a live log subscription, stored idempotently in SQLite and served as `/events`, a project history by share mint, and an owner's claims with exact totals. It is tested against a real `solana-test-validator` running `axel_v2.so`, including the event the transfer hook emits inside Token-2022. See [docs/architecture.md](docs/architecture.md#event-indexer-v2).
- Wrote the AXEL v2 program (`programs/axel-v2`, 24 instructions): escrowed fundraising with refunds, a KYC registry with restricted signers, a transfer hook inside the program, attested revenue deposits with claims that are safe against transfers and late buys, a telemetry hash chain and time-locked share recovery. It has 35 Rust tests and 530 LiteSVM tests, a generated client in `sdk/axel-v2`, and CI. Design: [docs/v2.md](docs/v2.md). It is not deployed yet.
- Redesigned the frontend ([`frontend/design.md`](frontend/design.md)): new landing page, asset, portfolio, payouts and operator pages, self-hosted fonts, licensed photos, and pages checked for layout, contrast and accessibility at five widths in EN / RU / KK. The asset page no longer shows made-up specs or income projections.
- Moved the frontend to v2: a client for `axel_v2` (PDAs, readers, the revenue math on BigInt, instruction builders including hooked transfers, error messages for every program code), hooks for the raise, refunds, claims, transfers, positions, payout history and roles, amounts in the payment token, and the admin console on the program's roles. The v1 client was removed from the UI.
- Built the judge demo path and Blinks: `/api/demo` routes (signed access with demo KYC, test tenge and SOL; shares from the desk through the transfer hook; simulated months deposited by the operator and attested by the oracle; limits in Upstash Redis; optional Turnstile), a `/demo` page that walks a judge through buy → shares → payout → claim → verify → solvency, and spec-compliant invest and claim Actions with `actions.json`. Checked end to end in a browser against a seeded local chain, with a wallet that really signs.
- Built the v2 screens: raise progress with a soft-cap marker, live escrow balance and a state timeline; a refund dialog that settles a failed raise first; in-browser verification of each car's telemetry chain, income reports and purchase papers; a live Proof of solvency page; the recovery flows (proposal, the owner's veto, execution); and the console split into platform admin, operator and KYC. Checked in EN / RU / KK at phone and desktop widths against a seeded local chain.

In progress during the hackathon (**planned, not done yet**):
- [ ] Public frontend deployment on devnet (the judge demo path and Blinks are built and checked on a local chain)
- [ ] End-to-end devnet demo with Explorer links: whitelist → buy → deposit → claim → transfer
- [ ] Deploy AXEL v2 under its new program ID (written and tested locally, see above)
- [ ] Connect the frontend to the v2 backend: KYC sign-in with the Sumsub WebSDK, the operator's attested deposit flow, payout history from the event index, and the backend's published telemetry in the layout the frontend verifies

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
- [x] Frontend on the v2 program: stablecoin amounts, the six project states, KYC records, escrowed buys, refunds, claims, transfers
- [x] Frontend v2 screens: in-browser verification of telemetry and reports, Proof of solvency, recovery flows, console split by role
- [x] Judge demo path and Solana Actions (Blinks), checked on a local chain
- [ ] Public deployment on devnet
- [ ] End-to-end devnet demo, including a holder-to-holder transfer
- [ ] Restrict `add_to_whitelist` / `remove_from_whitelist` to an authorized key
- [ ] Revenue claims that ignore shares bought or transferred after a deposit
- [ ] Create the hook's `ExtraAccountMetaList` during project setup
- [x] Backend as the v2 oracle: telemetry batches, published records, attested revenue reports, simulated data flagged
- [x] Backend event indexer for v2: project histories and claim histories
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
