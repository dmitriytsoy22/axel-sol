# Architecture

This document describes the code as it is in this repository. Where the code and the earlier planning documents disagree, the code wins; [planning/README.md](planning/README.md) lists those differences. The full specification of the program (every account, instruction, check, state and test) is in [v2.md](v2.md).

## System Overview

AXEL has five parts:

- **`axel_v2`**, one Anchor program on Solana ([v2.md](v2.md)). It takes a car's raise in escrow, keeps the KYC registry, is the transfer hook of every share mint, distributes attested revenue, records telemetry and runs share recovery.
- **One Token-2022 share mint per car**, whose every authority is the project PDA or none, and **stablecoin vaults** (escrow and revenue) owned by the project PDA.
- **A Next.js web app** that reads chain state directly and builds transactions from the vendored IDL. It also hosts the judge demo routes and the Solana Actions (Blinks).
- **A NestJS backend** for the jobs that need secrets or a server:
  - binding wallets to Sumsub applicants and writing their KYC records;
  - the daily telemetry job, which publishes each car's day and appends its hash to the chain as the project's oracle;
  - co-signing revenue deposits whose report matches the published data, including deposits it drafts for the operator to sign;
  - publishing each car's data in the layout the app's "Verify" reads;
  - indexing the history of program events for project timelines, claim histories and each wallet's payouts.

  It keeps KYC state, the published days, the attested reports and the indexed events in one SQLite file.
- **The demo seed** ([`scripts/seed-devnet`](../scripts/seed-devnet/README.md)), which fills a cluster with a fictional fleet in every project state and publishes the files the app verifies.

**Deployment status.** `axel_v2` is not deployed yet; everything above runs on local validators and in the end-to-end suite. The v1 programs (`axel` and `transfer_hook`) that were deployed to devnet before the hackathon are kept as legacy and are described at the end of this document ([Legacy: v1 Programs](#legacy-v1-programs)).

```
            Investor / judge wallet (Phantom, Solflare or any Wallet Standard wallet)
                                       │
                                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│ Web app — Next.js 14 (frontend/)                                       │
│ catalog · car page + Verify · portfolio · payouts · solvency · console │
│ /demo, /api/demo/* (judge routes) · /api/actions/* (Blinks)            │
│ reads accounts over JSON-RPC, builds transactions from the v2 IDL      │
└───────┬──────────────────────────────────────────────┬─────────────────┘
        │ RPC reads + wallet-signed transactions       │ HTTP /published, /telemetry, /v2, /events
        ▼                                              ▼
┌──────────────────────────────────────┐   ┌────────────────────────────────────┐
│ Solana                               │   │ Backend — NestJS 11 (backend/)     │
│                                      │   │ SQLite: KYC, published days,       │
│ axel_v2 (24 instructions)            │   │   attested reports, event index    │
│   Config · Investor · Project        │   │ telemetry job                      │──► Yandex Fleet API
│   Position · RevenuePeriod           │◄──┤   record_telemetry (oracle key)    │
│   RecoveryRequest                    │ tx│ reports: co-sign deposit_revenue   │
│   escrow + revenue token vaults      │   │ KYC sign-in + Sumsub webhook       │◄── Sumsub webhook
│ Token-2022 share mint (one per car)  │   │   set_investor (KYC authority key) │
│   transfer hook → axel_v2 `execute`  ├──►│ event indexer                      │
│ payment mint (stablecoin)            │ ws│   logsSubscribe + history (RPC)    │
└──────────────────────────────────────┘   └────────────────────────────────────┘
```

**Golden rule (from the spec):**
- Business state lives in on-chain accounts. The web app reads it straight from RPC, and no server keeps a copy.
- The backend's SQLite file holds:
  - sign-in nonces, which wallet belongs to which Sumsub applicant, and a log of webhook events;
  - the published text of every telemetry day, with its place in the chain;
  - the revenue reports the oracle attested;
  - an index of the program's events. It is a copy of chain history for timelines, not state: balances and project states are still read from the accounts, and the index can be rebuilt from the chain.

  KYC status itself lives in the `Investor` accounts. The telemetry chain head and each deposit's report hash live in `Project` and `RevenuePeriod`, so the stored texts can always be checked against the chain.

## Repository Layout

```
programs/
  axel-v2/src/                  v2 program: instructions/, state/, math.rs, hook, constants, errors (docs/v2.md)
  axel/src/, transfer-hook/src/ v1 programs (legacy, devnet)
tests-v2/                       v2 program tests on LiteSVM (node:test); scripts/ exports the frontend fixture
tests/                          v1 integration tests (node:test, local validator at 127.0.0.1:8899)
sdk/axel-v2/                    Codama TypeScript client of axel_v2 (@solana/kit)
scripts/
  seed-devnet/                  demo seed: plan, executor, SOL budget, publishing, proof-of-solvency check
  generate-clients.ts           Codama generation of sdk/axel-v2
  init-project.ts               v1 project creation
backend/src/                    health, kyc, fleet (Yandex Fleet client, simulator), telemetry, reports, indexer, solana
frontend/src/
  app/[locale]/                 routes (en default, ru, kk)
  app/api/demo/                 judge demo routes (devnet and localnet only)
  app/api/actions/, app/actions.json   Solana Actions (Blinks): invest and claim
  hooks/                        chain reads and transaction hooks
  lib/solana/                   axel_v2 client: cluster config, PDAs, readers, math, instruction builders, error messages, vendored IDL (idl-v2/)
  lib/verify/                   in-browser verification of published car data
  lib/api/                      telemetry, indexer and published-data HTTP clients
  lib/demo/, lib/actions/       demo route logic (keys, limits, tokens, transactions) and the Actions handlers
frontend/e2e/                   Playwright suite on a local stack: validator + demo seed + backend + next dev (e2e/stack/)
Anchor.toml                     program IDs for localnet and devnet; provider cluster = devnet
```

Toolchain pins:
- Anchor 0.32.1
- `spl-token-2022` 8
- `rust-toolchain.toml` pins Rust 1.89.0; the root `Cargo.toml` pins platform-tools v1.52

## Deployment

| Program | Cluster | ID |
|---|---|---|
| `axel_v2` | not deployed | `AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi` (reserved; the keypair is kept outside the repository) |
| `axel` (v1) | devnet | [`DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`](https://explorer.solana.com/address/DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M?cluster=devnet) |
| `transfer_hook` (v1) | devnet | [`5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`](https://explorer.solana.com/address/5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ?cluster=devnet) |

**What deploying v2 needs.**
- **Program.** About 4.12 SOL of rent at devnet's current rate for the 811,688-byte program ([v2.md](v2.md#build-test-and-deploy)).
- **Config and demo data.** The deployer, as upgrade authority, calls `initialize_config`. The demo seed does this, then fills the program with the fictional fleet: about 1.62 SOL at full scale, run twice an hour apart for the recovery.
- **Web app.** The seed needs the public site's URL first, because the share mints' metadata points to it. The judge demo's faucet needs about 1.8 SOL for 80 judges and 150 simulated months.
- **Blocker.** None of this has devnet SOL yet.

On 2026-09-24, devnet held two v1 `ProjectState` accounts. Both were created by `scripts/init-project.ts` and carry its test metadata:
- Token name "Axel Taxi #001"
- Toyota Camry 2023, VIN `XTA210990Y2856777`

Both projects have the same settings:
- Status Active, supply 100, price 0.1 SOL
- One revenue period each
- Admin and oracle are the same key, `G67xjxBnbN7B3GpX6BsGyPhFyKE8T8kuPGhZkWvvkZzm`

| ProjectState | Mint | Shares sold |
|---|---|---|
| `FcETyegc5PindjcQ67dLUkzfg2XSFpJ5s2XHLj2ANEMR` | `CEBjRiHfzycVPjXmD4xJbsg7gCQokyzEAigfEQbZqFK8` | 7 |
| `BfTeR9NTwrgh9Z24vEK339yoZfVKbpmtXgNH9zKyQnyG` | `Aj9qpbVQexrpp6HZojWuyq3s4W7ymTRpQ7uudZgz37YU` | 13 |

Every transaction on these two accounts is dated 2026-04-07: 4 and 6 transactions respectively.

## Roles and Keys

| Role | On-chain | Who holds it | Can |
|---|---|---|---|
| Upgrade authority | `ProgramData.upgrade_authority` | the deployer; a Squads multisig on mainnet | upgrade the program; call `initialize_config` once |
| Admin | `Config.admin` | the founder's key; a Squads multisig on mainnet | create projects, activate or cancel a raise, pause, resume and close projects, change operator and oracle, update the config within hard caps, propose a recovery |
| KYC authority | `Config.kyc_authority` | the backend (`KYC_AUTHORITY_KEYPAIR_PATH`) | write any `Investor` record |
| Demo KYC authority | `Config.demo_kyc_authority` | the web server's demo routes (`DEMO_KYC_SECRET`), devnet only; the default key disables it | grant or revoke DEMO access for at most 30 days, nothing else |
| Treasury | `Config.treasury` | the platform | receives the raise and revenue fees in its associated token accounts |
| Operator | `Project.operator` | the fleet that runs the car | receives the raise on activation; pays in revenue |
| Oracle | `Project.oracle` | the backend (`ORACLE_KEYPAIR_PATH`); the demo car's oracle is a demo route key | record telemetry; co-sign every revenue deposit |
| Anyone | — | any wallet | finalize a raise, open a position for a verified wallet, claim for a holder, execute a recovery after its delay |

The operator and the oracle must be different keys. The KYC key and the demo KYC key must differ. The web server's demo routes hold five keys (faucet, demo KYC, desk, the demo car's operator and oracle) and never the admin, KYC authority, treasury or upgrade keys ([api.md](api.md#judge-demo-api)).

## The `axel_v2` Program

A summary; [v2.md](v2.md) has the details and the tests behind each rule.

### Share Mint and Payment Mint

`create_project` creates the share mint at a fresh keypair address. It is Token-2022 with 0 decimals and these settings:

| Setting | Value |
|---|---|
| Mint and freeze authority | project PDA. The program mints only in `buy_shares` during the raise, and in `execute_recovery` the same number it burns |
| TransferHook | program `axel_v2`, authority none |
| DefaultAccountState | Frozen. A share account works only after `buy_shares`, `open_position` or `execute_recovery` thawed it |
| PermanentDelegate | project PDA, used only by `execute_recovery` |
| MetadataPointer | to the mint itself, authority none |
| TokenMetadata | name, symbol, uri and up to 8 car attributes (the seed writes `make`, `model`, `year`, `city`, `class`, `park`, `plate_hash`, `data_origin`); update authority project PDA, never used after creation |
| TransferFeeConfig | not present |

Payment mints must be in `Config.allowed_payment_mints` (up to 4): SPL Token, or Token-2022 with only allowlisted extensions. The devnet test token is tKZT, an SPL Token with 6 decimals and no freeze authority.

### Accounts

| Account | Seeds | Holds |
|---|---|---|
| `Config` | `["config"]` | admin and pending admin, KYC keys, treasury, fees for new projects, raise windows, allowed payment mints, protocol pause, recovery delay |
| `Investor` | `["investor", wallet]` | KYC status (`Active`, `Revoked`, `Frozen`), flags (`DEMO`, …), jurisdiction, expiry, provider |
| `Project` | `["project", share_mint]` | mints, operator, oracle, vaults, state, price, supply and sales, deadlines, fee snapshot, the revenue accumulator and totals, the telemetry head, count and last date, the purchase documents' hash |
| `Position` | `["position", project, owner]` | shares (always equal to the owner's share balance), accumulator checkpoint, unclaimed revenue, totals |
| `RevenuePeriod` | `["period", project, index]` | period dates, gross, fee, net, supply, accumulator after, report hash, attestor, telemetry head at the deposit, kind |
| `RecoveryRequest` | `["recovery", project, from_owner]` | both wallets, shares, reason hash, proposer, `eta` |
| Hook validation account | `["extra-account-metas", share_mint]` | the six extra accounts Token-2022 passes to the hook |
| Escrow and revenue vaults | `["escrow", project]`, `["revenue", project]` | payment-token accounts owned by the project PDA |

### Project Lifecycle

```
Fundraising ──► Funded ──► Operating ◄──► Paused
     │            │            │             │
     └─► Failed ◄─┘            └─► Closed ◄──┘
```

| From | To | By |
|---|---|---|
| — | Fundraising | `create_project` (admin) |
| Fundraising | Funded | `buy_shares` selling the last share, or `finalize_raise` (anyone) after the deadline with the soft cap met |
| Fundraising | Failed | `finalize_raise` after the deadline below the soft cap, or `cancel_raise` (admin) |
| Funded | Operating | `activate_project` (admin, before the activation deadline, with the purchase documents' hash) |
| Funded | Failed | `finalize_raise` after the activation deadline, or `cancel_raise` (admin) |
| Operating | Paused, and back | `pause_project`, `resume_project` (admin) |
| Operating or Paused | Closed | `close_project` (admin) |

- **Failed** and **Closed** are final. Refunds work only in Failed; claims work in Operating, Paused and Closed. In Failed the escrow can only flow back to buyers, each getting exactly `shares × price`.
- **Fees.** Activation pays `floor(gross × raise_fee_bps / 10 000)` to the treasury and the rest of the escrow to the operator. Each deposit pays `floor(gross × revenue_fee_bps / 10 000)` to the treasury. Both rates are copied from the config when the project is created and capped at 5% and 20%.
- **Windows.** A raise lasts at most 180 days, and a funded raise must be activated within the project's activation window (at most 90 days). Otherwise anyone can move it to Failed.
- **The protocol pause** (`Config.paused`) stops what brings money in or moves shares forward: buying, activation, transfers, deposits, and proposing or executing a recovery. It never stops claims, refunds, closing a position or a recovery veto.
- Every state-gated instruction is tested in each of the six states ([v2.md](v2.md#state-machine)).

### Transfer Hook (v2)

Token-2022 calls `axel_v2`'s `execute` on every share transfer, after it has moved the balances, with six extra accounts resolved from the validation account: the config, the project, both owners' `Investor` records and both `Position`s.

The hook:
1. requires the `transferring` flag Token-2022 sets on both token accounts, so a direct call fails;
2. checks that the mint is the project's share mint, the protocol is not paused and the project is Operating;
3. checks that both **token account owners** (not the transfer authority) have an eligible KYC record: Active, not expired, and DEMO only where the project accepts demo investors;
4. settles both positions and moves the amount between them, and fails with `LedgerMismatch` unless each balance now equals its position.

A recipient needs a position first. The app adds `open_position` to the same transaction and lists the hook's accounts itself, so the transfer works in wallets that do not resolve extra accounts. A transfer costs about 40–66k compute units.

### Revenue and Claims

Revenue per share is an accumulator `acc` in Q64.64:

```
deposit:  fee = floor(gross × revenue_fee_bps / 10 000); net = gross − fee
          acc += floor(net × 2^64 / supply)              supply = sold − refunded − retired
settle:   owed = floor(shares × (acc − checkpoint) / 2^64); accrued += owed; checkpoint = acc
claim:    settle; pay accrued to the owner's canonical payment account; accrued = 0
```

- Every rounding step floors, so the sum of all payouts never exceeds the sum of net deposits; the dust stays in the vault. A proptest in `math.rs` and a 200-step randomized run against a BigInt model check it.
- The hook settles both sides before shares move, so income earned before a transfer stays with the sender, and shares bought or received later earn only from then on.
- `claim` can be sent by anyone, and the money always goes to the owner's own associated token account. The seed uses this for an autopay crank.
- The sale of the car is a `deposit_revenue` of kind `Final` through the same accumulator, before `close_project`. Claims stay open after closing.

Invariants checked after every step of the randomized tests, by the seed on every project, and (except I3) live on the Proof of solvency page:
- **I1** revenue owed to holders ≤ deposited net − claimed ≤ revenue vault balance;
- **I2** share supply = sold − refunded − retired = sum of positions;
- **I3** every holder's share balance = its position;
- **I4** escrow balance = (sold − refunded) × price while the escrow exists;
- **I5** no position's checkpoint is ahead of `acc`.

### Recovery

Recovery gets a holder's shares back after a lost key, or passes them to heirs:

1. **Propose.** The admin calls `propose_recovery` with the old wallet, the new wallet (which needs an eligible KYC record), the shares and the SHA-256 of the off-chain case file. The request's `eta` is `now + recovery_delay` (1 hour to 30 days).
2. **Veto.** Until `eta` the old wallet can cancel it, and the admin can withdraw it until it runs. No pause blocks a cancellation. The portfolio page shows a pending request with a veto button.
3. **Execute.** From `eta` anyone can call `execute_recovery`. It re-checks the pause, the freeze, the new wallet's KYC and both ledgers. Then it burns the shares from the old wallet as permanent delegate, mints the same number to the new wallet, and moves the unclaimed revenue pro rata.

The supply never changes, a sanctions-frozen wallet is never touched, and recovery works in every project state. Mainnet needs a delay of at least 72 hours and Squads multisigs as admin and upgrade authority ([programs/axel-v2/README.md](../programs/axel-v2/README.md#mainnet-requirements)).

## Oracle / Telemetry Flow

This is the v2 flow. The backend does not send anything to the v1 program.

```
Yandex Fleet API / simulator      Backend                                          Solana (axel_v2)
      │ orders, driver profiles,  │ daily job (CRON_SCHEDULE)                        │
      │ rent transactions         │ 1. collect each car's missing days (≤ 31 back)   │
      │ ◄──────────────────────── │    → day record, RFC 8785 text, SHA-256          │
      │                           │    → SQLite, published at /published/<mint>/...  │
      │                           │ 2. record_telemetry, ≤ 20 days per tx ─────────► │ Project.telemetry_head
      │                           │                                                  │
 operator wallet ── POST /v2/deposits/draft (monthly report) ──► checks, the deposit │
                    co-signed by the oracle comes back; or /reports/draft + /attest  │
 operator wallet ── signs and sends deposit_revenue ───────────────────────────────► │ RevenuePeriod.report_hash
```

1. **Cars.** `FLEET_CONFIG` maps each share mint to a plate, a source (`yandex_fleet` or `simulated`) and the park's fee. The day boundaries follow `FLEET_UTC_OFFSET` (Kazakhstan, `+05:00`).
2. **Collecting.** For every car the job reads each finished day it does not have yet, oldest first.
   - With Yandex Fleet:
     - trips and distance come from the park's completed orders, matched by plate (spaces removed, upper-cased, Cyrillic look-alikes mapped to Latin);
     - the rent comes from the park's rent-charge transactions for the drivers currently assigned to the car.
   - If a request fails, the car stops at that day and nothing is invented.
   - Simulated cars use a deterministic generator, and their records say `data_origin: "simulated"`.
3. **Publishing.** Each day becomes a record whose RFC 8785 text is stored as is and hashed with SHA-256. The text never changes once collected. Once its batch is confirmed, the day is published in the car's monthly file under `/published/<mint>/`, in the layout the app's "Verify" reads ([api.md](api.md#published-car-data-read-by-verify)).
4. **Recording.** The oracle key appends the days to the project's chain with `record_telemetry`, 20 per transaction. Each signed batch is stored before it is sent, so after a crash the next run can tell whether it landed.
   - It writes only while the project is Operating or Paused, and only if the project's oracle is its key.
   - It stops if the chain holds a head it did not write.
   - `GET /telemetry/:mint/proof?date=` gives a day's text, hash, chain position, heads and transaction.
5. **Attesting revenue.**
   - The operator sends its monthly report for a period to `POST /v2/deposits/draft`. The report adds up the rent from the published days, subtracts the park's fee and the operator's maintenance and insurance items (each with an optional document hash), and gives the deposit amount; any figure the operator states must match.
   - The backend refuses a period that overlaps an earlier deposit, builds `deposit_revenue` for the project's next period with the operator as fee payer, and signs it as the oracle. The operator's wallet adds its signature and sends it. Only one deposit per period index can land, so a draft that is never sent blocks nothing once another deposit takes its index.
   - The older path still works: the operator's wallet signs a deposit built from `POST /reports/draft`, and `POST /reports/attest` checks the transaction (only that deposit, nothing else for the oracle to sign) before adding the oracle's signature.
   - The report is published at `/published/<mint>/reports/<hash>.json`, its hash is in the deposit's `RevenuePeriod`, and the car's index lists it once the deposit is indexed.

[api.md](api.md#telemetry-what-is-published) has the record and report formats, the status codes and every check.

**What this does and does not prove.**
- It proves that the deposit pays out exactly the published report. The report's income comes only from days whose hashes are in the chain, and simulated data is marked as such, inside the hashed text.
- It does not prove that the fleet system reported the truth, or that the operator's expense items are complete. The oracle is one backend key, and the Yandex rent attribution uses the drivers' current car assignment.

## Event Indexer (v2)

The backend indexes the events `axel_v2` emits, so the frontend can show a car's timeline and an investor's payouts without scanning the chain itself. Endpoints: [api.md](api.md#program-events-what-is-indexed). `GET /v2/wallets/:wallet/payouts` replays each of the wallet's positions from the events with the program's accumulator math, so its `pending` is exactly what a claim pays ([api.md](api.md#indexer-api-read-by-the-frontend)).

```
logsSubscribe (confirmed, mentions axel_v2) ── notification ──┐   logs kept, sync starts now
resubscribed after a drop ────────────────────────────────────┤
poll every INDEXER_POLL_INTERVAL_MS ──────────────────────────┤
                                                              ▼
getSignaturesForAddress(axel_v2, until = cursor), paged to the cursor, then oldest first:
   failed transaction   → stored without events
   notified             → the notification's logs
   otherwise            → getTransaction(confirmed)
   logs → invoke stack → axel_v2's `Program data:` records, including those written as the
          Token-2022 transfer hook → decoded with the vendored IDL (round trip checked)
   SQLite, one transaction per chain transaction: transaction, events, cursor
```

- The history is the source of truth and the subscription only makes it fast. Nothing that the subscription alone reports is stored.
- A failed sync is retried after 1 s, doubling up to 60 s. A notified transaction that the history does not list yet is retried the same way for up to two minutes.
- The database remembers the genesis hash and program ID it was filled from, and halts on a mismatch.
- The subscription is a small `ws` client, not web3.js's. web3.js hides its reconnects, so it could not trigger a catch-up, and it keeps a socket reconnecting after shutdown.
- `npm run test:localnet` runs it against `solana-test-validator` with the built `axel_v2.so`. The test sends real transactions (config, KYC, create, buys, activation, telemetry, a deposit, claims and a hooked transfer), some before the backend starts and some while it runs, then restarts the backend. It checks each event against the chain: the claim against the balance change, and the telemetry head against `Project`.
- A second local-validator test runs the operator's flow: the backend writes a simulated car's days as its oracle, the operator signs two drafted deposits with a share transfer between them, the published files rebuild the project's telemetry head and each period's `report_hash`, and each holder's `pending` equals the program's settle on the real accounts and what the claim then pays.

## KYC Flow (v2)

The backend writes `Investor` records with its own key, `Config.kyc_authority`. That key signs nothing else, and the admin key is not on the server.

```
Wallet ──► GET  /kyc/nonce?wallet=…     Sign-In With Solana message with a single-use nonce (5 min)
       ──► POST /kyc/session            wallet, nonce, signature
             backend: ed25519 check, nonce burned, wallet bound to a random externalUserId (SQLite)
       ◄── Sumsub WebSDK token for that externalUserId
Wallet ──► Sumsub WebSDK (documents, liveness)
Sumsub ──► POST /kyc/webhook            X-Payload-Digest + X-Payload-Digest-Alg
             backend: HMAC over the raw body (timingSafeEqual), refused if no secret is set
             GREEN  → confirm with the Sumsub API (same externalUserId, completed, GREEN, our level)
                      → set_investor(Active, expires in 12 months, jurisdiction from the documents, Sumsub)
             reset, deactivated, RED FINAL → set_investor(Revoked), only for records Sumsub granted
             nothing is sent if the record would not change; events for one wallet run in order,
             and an event older than the last applied one is ignored
```

Safety rules:
- **Only a wallet that signed can be approved.** `externalUserId` is a random ID the backend creates after the signature check, so nobody can start a check for a wallet they do not control.
- **A sanctions freeze is never lifted or overwritten** by a webhook; manual and demo records are never revoked by one.
- **Retries are safe.** Sumsub retries any non-2xx answer. An RPC outage, a failed transaction or a Sumsub API error returns 5xx, and the retry finds the on-chain record as it really is.
- **Fail closed.** Without `SUMSUB_WEBHOOK_SECRET` or the KYC key the webhook answers 503; in production the backend does not start without them ([api.md](api.md#backend-configuration)).

Where the records come from today:
- The web app's `/verify` page signs the nonce with the wallet, opens the session and runs the Sumsub WebSDK when `NEXT_PUBLIC_KYC_API_URL` is set ([api.md](api.md#kyc-session)). The approval is written by the webhook above; the page reads the record until it appears.
- The console writes `Investor` records with `set_investor` when the connected wallet holds the KYC key or the demo KYC key.
- The judge demo writes DEMO records through its own routes.
- The Sumsub request shapes have not been run against Sumsub's sandbox.

## Frontend

The frontend runs on `axel_v2`; the v1 client and IDL were removed from it. With v2 not deployed, devnet shows an empty catalog, and the app is used against a local validator (`NEXT_PUBLIC_SOLANA_NETWORK=localnet`).

It uses:
- Next.js 14 App Router, React 18, TypeScript and Tailwind.
- `next-intl`. Locales are `en` (default, no URL prefix), `ru` and `kk`, so for example `/ru/dashboard`.
- Wallet Adapter with Phantom and Solflare, plus any Wallet Standard wallet, and `autoConnect`. The cluster, RPC and program ID come from the environment ([api.md](api.md#frontend-environment)). A build with `NEXT_PUBLIC_E2E=1` adds "E2E Burner" (`lib/solana/e2eBurnerWallet.ts`), which signs with a key in `localStorage`, for the end-to-end suite only and never on mainnet.
- The client in `lib/solana/` ([api.md](api.md#typescript-client-frontend-axel_v2)). Amounts are `bigint` base units of the project's payment token and are shown with its symbol and decimals (tKZT, USDC), never in SOL; the SOL balance in the wallet menu is for fees.

| Route | What it does | Chain access |
|---|---|---|
| `/` | Landing page: figures from the chain (value sold per payment token), the catalog with filters by state, city and class (each shown once the cars differ in it), how it works, Explorer links, risks | `getProgramAccounts` for `Project`, one `getMultipleAccounts` for the share mints' metadata and the payment mints |
| `/assets/[id]` | Asset page, `id` = share mint: state, price, raise progress with a soft-cap marker, the deadline, the escrow balance read live, a timeline of the state machine, terms and holder count, the buy action, the wallet's shares with a refund for a failed raise, a public "settle the raise" once its outcome is certain, deposit history, "Check the car's data yourself", the latest day of trip data with its data origin (from the backend, or from the published files matched to the chain's head), payout calculator | `Project`, the escrow and income vault token accounts (every 15 s), the wallet's `Investor` and `Position`, the car's `Position`s, `RevenuePeriod`s; `buy_shares`, `refund` (with `finalize_raise` first when needed), `finalize_raise` |
| `/dashboard` | Portfolio: a pending recovery of the wallet's shares with a veto, value, shares, what a claim pays now; per car claim, refund, or send shares; claim all; with an indexer, the wallet's part of its three newest payouts | `RecoveryRequest`s by old owner, `Position`s by owner, `Project`s; `cancel_recovery`, `claim` (up to four per transaction), `refund`, `open_position` + hooked `transfer_checked` |
| `/payouts` | Deposits of the wallet's cars and its claimed and claimable totals; with an indexer, its part of each deposit, its claims, and the totals as of the index's slot | `Position`s, `RevenuePeriod`s, or the [indexer API](api.md#indexer-api-read-by-the-frontend) |
| `/verify` | The wallet's record in the KYC registry, and the identity check: a signed nonce, then the Sumsub WebSDK ([api.md](api.md#kyc-session)); without a KYC backend, how to get demo access | The wallet's `Investor` (every 10 s while the page is open) |
| `/solvency` | Proof of solvency: for every car, the income vault against deposited minus claimed and what holders are owed now, the escrow against (sold − refunded) × price, the share supply against the ledger and the positions, and the revenue checkpoints; checked again every 30 s | Every `Project` and `Position`, then one `getMultipleAccounts` for each car's income vault, escrow and share mint |
| `/demo` | The judges' path, on a demo deployment (`NEXT_PUBLIC_DEMO_ACCESS=1`, devnet or localnet): demo access, buy in an open raise, shares from the desk, a simulated month, claim, verify, proof of solvency; each step's state read from the chain | The wallet's `Investor`, `Position`s and `Project`s; `claim`. Access, shares and simulated months go through the [demo routes](api.md#judge-demo-api), which send their own transactions |
| `/api/demo/*`, `/api/actions/*`, `/actions.json` | [Judge demo routes](api.md#judge-demo-api) and [Solana Actions](api.md#solana-actions-blinks) | Server-side: `set_investor`, mint and SOL drip, `open_position` + hooked transfer, `deposit_revenue` co-signed by the oracle (demo); unsigned `buy_shares` and `claim` (Blinks) |
| `/admin` | Console split by the keys the wallet holds. **Platform admin:** each car's state (settle, activate with the purchase documents' hash, cancel raise, pause, resume, close), its operator and oracle, share recovery (propose, run, withdraw), and the config account. **Operator:** its cars' deposits, keys, live income vault and payout history, and the monthly deposit: the report typed or loaded from a file, the deposit drafted and co-signed by the oracle backend, checked in the browser, then signed by the operator's wallet ([api.md](api.md#deposit-draft-operator-flow)). **KYC:** looks a wallet's record up, then approves or revokes it; the demo key is stopped before it touches a record it may not change | `Config`, `Project`s, `RecoveryRequest`s, `Investor`; `finalize_raise`, `activate_project`, `cancel_raise`, `pause_project`, `resume_project`, `close_project`, `set_project_roles`, `propose_recovery`, `execute_recovery`, `cancel_recovery`, `set_investor`; `deposit_revenue` co-signed by the oracle |

Details:

- Access comes from the roles on-chain (`hooks/useAdminRoles.ts`): `Config.admin`, `Config.kyc_authority`, `Config.demo_kyc_authority` and each project's `operator`. `/admin` is not in the navigation bar; a wallet with several roles switches between them with tabs.
- On every test network a banner under the navigation bar says the data is the fictional demo seed of `scripts/seed-devnet`; on the home page the hero says it. On a demo deployment the banner, the mobile menu and a car page's purchase panel (for a wallet without KYC) lead to `/demo`.
- The demo routes hold five keys, each for one role (faucet, demo KYC, desk, the demo car's operator and oracle), never the admin's. The limits live in Upstash Redis when configured; a wallet's session from the access route is an HMAC token, so the shares and simulation routes need no storage to know who went through access. A simulated month's report holds only what the period account records, so "Check the car's data yourself" rebuilds it and labels the deposit as simulated.
- The buy button reads the wallet's `Investor` record (`hooks/useInvestor.ts`) and judges it with the program's rule (`lib/solana/eligibility.ts`): active, not expired, and DEMO only where the project accepts it. Otherwise it names the reason. The purchase dialog says where the money goes (escrow, refund rule) and discloses a payment token whose issuer can freeze, seize or pause.
- Portfolio figures use `pendingRevenue`, the program's settle on BigInt, so "Ready to claim" is exactly what a claim pays.
- A transfer reads the recipient's KYC record and position while the address is typed, refuses a wallet the hook would refuse, and adds `open_position` when the recipient has no position yet.
- A refund opens a dialog with the amount, the shares burned and the only account it can go to. When a raise has failed but nobody settled it, the refund transaction runs `finalize_raise` first.
- "Check the car's data yourself" (`components/asset/VerifyData.tsx`, `lib/verify/`) downloads the car's published files ([api.md](api.md#published-car-data-read-by-verify)), rebuilds the telemetry hash chain with the browser's WebCrypto over RFC 8785 canonical JSON, and compares it with the project's `telemetry_head`, `telemetry_count` and `last_telemetry_date`. It also checks every deposit's income report against its `report_hash`, finds the day each deposit's `telemetry_head` snapshot points to, and checks the purchase document against `acquisition_doc_hash`.
- Proof of solvency (`lib/solana/solvency.ts`) reads the accounts in several RPC calls, so a transaction can land between them; a failed check is read again once before it is reported. The rule that every share account equals its position needs every token account of every share mint and is left to the seed's `verify-invariants` script.
- Every transaction result is shown in a toast with an Explorer link. Failures are explained in the user's language: every `axel_v2` error code has a message in `messages/*.json` (`ProgramErrors`), and wallet refusals, missing SOL, expired blockhashes and RPC failures have their own (`TxErrors`).
- Revenue deposits need the oracle's co-signature, which the console cannot produce. The backend's `POST /v2/deposits/draft` returns a deposit the oracle already signed, for the operator's wallet to sign and send ([Oracle / Telemetry Flow](#oracle--telemetry-flow)), but the console does not call it yet. `create_project` has no UI yet; projects are created by the seed or a script.
- Car photos are stock photos picked by make and model (`components/catalog/vehiclePhoto.ts`) and always marked "Illustrative photo": a share mint holds no photo of its car. Credits are in `public/images/CREDITS.md`. Design rules: [`frontend/design.md`](../frontend/design.md).
- Security headers are set in `next.config.mjs`: a CSP whose `connect-src` allows the public Solana clusters, Helius, a local validator, and the configured RPC, telemetry, indexer and published-data origins; `X-Frame-Options: DENY`; `nosniff`; a Referrer-Policy; and a Permissions-Policy.

## Demo Seed

[`scripts/seed-devnet`](../scripts/seed-devnet/README.md) fills a cluster running `axel_v2` with a fictional fleet: tKZT, the config, four "Demo Park" parks, KYC-verified investors, and cars in all six states. On top of that it adds months of telemetry, attested deposits, claims (some by an autopay crank), transfers, a car sale before closing, a pause, a failed raise with refunds and a share recovery.

- **Deterministic.** Every key comes from `DEMO_SEED_SECRET` through HKDF, and the plan is a pure function of the seed, the scale and the anchor date.
- **Resumable.** The executor writes each step's signature as pending before sending it. After a crash it looks the signature up on the cluster, so no step runs twice.
- **Published and checked.** It publishes each car's files in the layout the app's "Verify" reads, all hashed as RFC 8785 JSON. After a run it checks I1–I5 on every project, recomputes every published hash against the chain, and compares every position with its BigInt ledger model.
- **Budgeted.** `--dry-run` prices the SOL budget with the cluster's live rent.
- **Labelled.** Every economic figure is labelled as an assumption, and every document and share mint carries `data_origin: "devnet-demo-seed"`.

## Testing

| Suite | Command | What it proves |
|---|---|---|
| Program on LiteSVM (530) | `npm run test:v2` | every instruction, every rejection with its exact error, every state × instruction, authority checks, randomized runs against a BigInt model with the invariants after every step |
| Program in Rust (35) | `cargo test -p axel-v2` | the math with proptest (no overpayment, bounded dust, no overflow), dates, the telemetry chain, account layouts |
| SDK (73) | `npm --prefix sdk/axel-v2 test` | the generated client against Anchor's coder for every instruction, account and type |
| Frontend (588) | `npx vitest run` in `frontend/` | instruction builders against the IDL and `@solana/spl-token`'s hook resolver; readers and payout math against accounts the real program wrote; verification, solvency, demo routes, Blinks and components; the identity check with a fake Sumsub WebSDK; the operator's drafted deposit, checked and signed, against a fake backend answer signed by a real oracle key |
| Backend (397) | `npm test` in `backend/` | the whole app with only the RPC, Sumsub, Yandex Fleet and the clock replaced; the fake RPC applies `set_investor` and `record_telemetry` as the program does |
| Backend on a local validator (2) | `npm run test:localnet` in `backend/` | the indexer against `solana-test-validator` running `axel_v2.so`, including a restart; the operator's drafted deposits, the published files and each holder's exact pending amount against the real accounts |
| Demo seed (90) | `npm run test:seed` | canonical JSON against RFC 8785, the chain against the program's vectors, keys, the plan, the budget, the ledger model |
| End to end (8) | `npm run test:e2e` in `frontend/` | the judge path, with the payout history and portfolio read from the backend's index and the trip data widget matched to the chain; the KYC refusal and the identity page; English, `/en/…` and `/ru/…` pages and the language menu on the address the browser opened; against the real app, backend and program on a freshly seeded validator |
| v1 (49) | `anchor test --provider.cluster localnet` | the legacy programs on a local validator |

CI (`.github/workflows/ci.yml`) runs the frontend, backend, demo seed, programs, backend localnet and end-to-end jobs. It also fails when the vendored IDL or the SDK differs from a fresh build. The v1 tests are typechecked in CI but run locally only.

## Security Properties (v2, as implemented)

- **KYC on every hold and move.** Only wallets with an eligible `Investor` record can buy, open a position, receive a recovery, or be on either side of a transfer. The hook checks the token accounts' owners, so a delegate cannot move a non-verified owner's shares.
- **Only the KYC key writes KYC.** The demo key is limited to DEMO records of at most 30 days and cannot touch frozen or non-DEMO records. `initialize_config` accepts only the upgrade authority, so nobody can front-run the deployment.
- **Money has one way out of each vault.** The escrow goes to the operator's and the treasury's canonical accounts on activation, or back to each buyer on refund. The revenue vault pays only an owner's canonical account on claim. No instruction sweeps a vault, and `close_project` moves no funds.
- **No human authority over a share mint.** Mint, freeze, permanent delegate and metadata update authority are the project PDA; the hook and the metadata pointer have none.
- **The ledger always matches the balances.** Every thawed share account has exactly one position, and a transfer fails unless both balances equal their positions afterwards.
- **Exact payouts.** The accumulator floors at every step, and claims can never exceed net deposits.
- **Attested revenue.** Every deposit is signed by the operator and the oracle, which must be different keys, and stores the report hash and the telemetry head.
- **Append-only telemetry.** Real calendar dates must strictly increase, so no day can be rewritten or inserted.
- **Bounded powers.** Fees are capped at 5% and 20% and fixed per project. Escrow time is capped at 180 + 90 days. The price is immutable. Recovery is time-locked and vetoable.
- **Checked arithmetic** everywhere, with u128 intermediates for the accumulator.

## Known Limitations

### v2 (open)

These are the known gaps of the current code. None of them is a v1 leftover.

1. **Not deployed and not audited.** `axel_v2` has run only on LiteSVM and local validators.
2. **One oracle key per project.** It attests what the fleet system reports; whether the fleet system reports the truth is trusted. The backend holds the same key for telemetry and for co-signing deposits.
3. **Rent attribution.** Yandex Fleet rent is matched to a car through the drivers assigned to it now, not at the time of the charge. The Yandex Fleet and Sumsub request formats have not been run against the real services.
4. **`close_project` before the `Final` deposit.** Nothing requires the sale proceeds to be deposited before closing. If the admin closes first, they can no longer be deposited on-chain; the admin still cannot take them.
5. **A stolen key can veto a recovery.** Recovery is designed for lost keys and inheritance, not theft.
6. **Single keys on devnet.** The admin and the upgrade authority are single keys. The mainnet requirements (Squads multisigs, a recovery delay of at least 72 hours) are documented but not enforced by the program.
7. **One published data source, and untested outside services.** The app reads published car data from one base URL, so a deployment verifies either the seed's cars (`/demo-data`) or the backend's (`<backend>/published`), not both, and the trip data widget's fallback reads the same base. The backend does not publish the purchase documents of its cars. The Sumsub WebSDK flow and the operator's deposit flow in the console are covered by unit tests with a fake WebSDK and a fake backend answer; neither has run against Sumsub's sandbox or a hosted backend.
8. **Backend operations.** The backend must run as a single instance (ordering and rate limits live in the process). The KYC and oracle keys are JSON files on disk. The indexer reads at `confirmed` commitment, and days older than 31 are not backfilled.
9. **Proof of solvency in the browser** skips I3 (every share account equals its position), which needs every token account of every share mint; the seed's `verify-invariants` script checks it.
10. **Wallets and the hook.** Wallets that do not resolve extra accounts cannot transfer shares on their own. The app builds transfers with the hook's accounts itself.

### v1 Limitations

These come from reading the v1 code on 2026-09-24. The program items are fixed in `axel_v2` ([v2.md](v2.md#v1-limitation--v2-fix)); items 5 and 6 were fixed when the backend moved to v2, and items 7 and 8 when the frontend did. The numbering is referenced from [v2.md](v2.md#v1-limitation--v2-fix).

1. **Anyone can whitelist anyone.** `add_to_whitelist` and `remove_from_whitelist` accept any signer. Any wallet can approve itself, which defeats KYC gating for `buy_tokens` and for the hook. It can also revoke other wallets. The integration tests call both instructions with a freshly generated keypair.
2. **Revenue claims use the current balance.** `claim_revenue` pays `current balance / snapshot × deposit`. Two cases pay out more than intended:
   - Shares bought after a deposit can claim that earlier period.
   - A holder can claim, transfer the shares to another whitelisted wallet, and claim the same period again, since `ClaimRecord` is per wallet.

   Total claims for a period can therefore exceed its deposit and draw on SOL meant for other periods. The snapshot only fixes the denominator.
3. **Secondary transfers fail on devnet today.** Neither devnet mint has an `ExtraAccountMetaList` (checked 2026-09-24), because `scripts/init-project.ts` does not create one. The hook tests use a separate mint that has only the TransferHook extension, so the full six-extension transfer path has no end-to-end test.
4. **Token accounts are thawed only in one place.** The program thaws an account only inside `buy_tokens`, and only when the buyer's ATA does not exist yet. The freeze authority is the program PDA, and no other instruction thaws. This has three consequences:
   - A wallet can receive shares by transfer only if it has already bought through `buy_tokens`.
   - Once every share is sold, no new wallet can get a thawed account.
   - Anyone can create an ATA for any wallet. If a wallet's ATA is created before its first purchase, the ATA stays frozen and that wallet's `buy_tokens` fails when minting.
5. **No telemetry was written on-chain.** The backend's v1 `record_telemetry` transaction passed an extra `mint` account, so the telemetry PDA check always failed. That path is removed. The backend now writes v2 `record_telemetry` batches built from the IDL ([Oracle / Telemetry Flow](#oracle--telemetry-flow)), so v1 projects get no telemetry.
6. **Simulated telemetry was not flagged.** It was served like real data, and the backend fell back to it silently when Yandex failed. Now every record carries `data_origin` inside its hashed text, there is no fallback, and simulated cars are refused on mainnet.
7. **The telemetry widget did not reach the backend.** It fetched `${NEXT_PUBLIC_API_URL}/telemetry/latest/:mint`, a variable no example file set, and it kept showing the first car's data after moving to another car. The v2 frontend reads `NEXT_PUBLIC_TELEMETRY_API_URL`, makes no request when it is unset, and reads again when the car changes. The backend answers only the origins in `CORS_ORIGINS`, so the frontend's origin must be listed there.
8. **The whitelist status hook always returned false.** `useWhitelistStatus` passed the whitelist PDA where the reader expected the wallet. It is gone; the v2 frontend reads `Investor` records with `useInvestor`.
9. **The revenue vault is subject to rent rules.** The vault is a 0-byte system account, so Solana's rent-state rules apply. A deposit that would leave an empty vault below the rent-exempt minimum (890,880 lamports) is rejected. So is a claim that would leave a non-zero balance below that minimum. Rounding dust can therefore block the last claim of a period, unless the vault holds extra SOL.
10. **Transfer-fee rounding.** Token-2022 rounds the fee up, and shares have 0 decimals, so every transfer pays at least one whole share. A 1-share transfer delivers nothing to the recipient.
11. **The admin holds strong powers.** The admin receives all sale proceeds immediately and sweeps the vault on close. The admin is also the permanent delegate: it can move or burn any holder's shares with Token-2022 directly. On devnet these are single keys. The code comment mentions a Squads multisig for production, but none is configured.

## Legacy: v1 Programs

v1 is two Anchor programs, `axel` and `transfer_hook`, deployed on devnet on 2026-04-07 ([Deployment](#deployment)). They stay in `programs/axel` and `programs/transfer-hook` with their tests; the app, the backend and the seed no longer use them. This section documents them as deployed.

### Token-2022 Mint (v1)

`initialize_project` creates the mint with 0 decimals, so one token is one whole share. It then configures six mint extensions. The table shows each extension and who holds its authority.

| Extension | Configuration in `initialize_project.rs` | Authority |
|---|---|---|
| TransferHook | Hook program = `params.transfer_hook_program_id` (the seed script passes the deployed `transfer_hook`) | admin |
| DefaultAccountState | `Frozen`: every new token account starts frozen | — |
| PermanentDelegate | Delegate can transfer or burn shares from any holder account | admin |
| TransferFeeConfig | 100 basis points (1%), maximum fee `u64::MAX` (no cap) | config and withdraw-withheld: admin |
| MetadataPointer | Points to the mint itself | admin |
| TokenMetadata | name, symbol, uri, and extra fields `vin`, `make`, `model`, `year`, `valuation_sol` | update authority: admin |

The mint's base authorities:

- **Mint authority:** the `ProjectState` PDA, so only the program can mint. `revoke_mint_authority` sets it to `None` once every share is sold.
- **Freeze authority:** the `ProjectState` PDA. The program thaws a buyer's new token account inside `buy_tokens`.

Other details:

- **No shares at creation.** `initialize_project` mints nothing. Shares are minted to the buyer inside `buy_tokens`. Minting is not a transfer, so primary sales do not trigger the hook or the fee.
- **Transfer fee:** withheld in shares, not SOL, in the recipient's token account. No program instruction or UI collects withheld fees. The admin could withdraw them with standard Token-2022 instructions as the withdraw-withheld authority.
- **Memo Transfer:** not enabled. It was in the spec but is not in the code.
- **Hook setup:** the mint does not create the hook's `ExtraAccountMetaList`. That account must be created separately with `transfer_hook.initialize_extra_account_meta_list` (see [v1 Limitations](#v1-limitations)).

### Accounts and PDAs (v1)

All `axel` accounts are Anchor accounts (8-byte discriminator), owned by the `axel` program. Integers are little-endian where they appear in seeds.

| Account | Program | Seeds | Fields |
|---|---|---|---|
| `ProjectState` | axel | `["project", mint]` | `admin`, `mint`, `revenue_vault`, `token_supply`, `tokens_sold`, `price_per_share` (lamports), `status` (Active / Paused / Closed), `period_count`, `oracle_pubkey`, `bump`, `revenue_vault_bump` |
| Revenue vault | axel (system-owned address) | `["revenue", mint]` | No data. A plain system account that holds the SOL for payouts; only the program can sign for it. |
| `RevenuePeriod` | axel | `["revenue_period", mint, period_index: u32]` | `project` (stores the **mint**), `period_index`, `total_deposited` (lamports), `token_supply_snapshot`, `deposited_at`, `bump` |
| `ClaimRecord` | axel | `["claim", revenue_period_pda, investor]` | `claimed`, `bump`. Its existence blocks a second claim by the same wallet for that period. |
| `WhitelistEntry` | axel | `["whitelist", wallet]` | `approved`, `bump`. **Global**: one entry per wallet, shared by all projects. |
| `TelemetryRecord` | axel | `["telemetry", mint, date: u32]` | `project` (stores the mint), `date` (YYYYMMDD, e.g. `20260401`), `data_hash` (SHA-256), `oracle_pubkey`, `recorded_at`, `bump` |
| `ExtraAccountMetaList` | transfer_hook | `["extra-account-metas", mint]` | The extra accounts Token-2022 must pass to the hook (see below) |
| Investor token account | Associated Token program | standard ATA for Token-2022 | Created and thawed by `buy_tokens` the first time a wallet buys |

### Instructions (`axel` program)

There are 12 instructions. "Admin" means `ProjectState.admin`, enforced with Anchor `has_one = admin`.

| # | Instruction | Who can call | Preconditions | Effect |
|---|---|---|---|---|
| 1 | `initialize_project(params)` | Any wallet; it becomes the project admin. The new mint keypair also signs. | `price_per_share > 0`; `car_cost % price_per_share == 0` | Creates the Token-2022 mint (6 extensions, metadata) and `ProjectState` (Active, `token_supply = car_cost / price_per_share`, `tokens_sold = 0`) |
| 2 | `add_to_whitelist(wallet)` | **Any signer.** There is no admin check (see v1 Limitations). | — | Creates or updates `WhitelistEntry{approved: true}`; the signer pays rent (`init_if_needed`) |
| 3 | `remove_from_whitelist(wallet)` | **Any signer.** There is no admin check. | Entry exists | Sets `approved = false`; the account stays |
| 4 | `buy_tokens(token_amount)` | A wallet whose `WhitelistEntry.approved` is true | Status Active; `token_amount > 0`; `token_amount <= token_supply - tokens_sold` | Sends `token_amount × price_per_share` lamports from the investor **directly to the admin**. If the investor's ATA does not exist, creates it and thaws it. Mints the shares to the investor and adds them to `tokens_sold`. |
| 5 | `deposit_revenue(period_index, amount)` | Admin | Status Active; `amount > 0`; `period_index == period_count`; `tokens_sold > 0` | Moves `amount` lamports from the admin to the revenue vault. Creates a `RevenuePeriod` with `token_supply_snapshot = tokens_sold`. Increments `period_count`. |
| 6 | `claim_revenue(period_index)` | Any holder | Status Active. The token account is Token-2022, for this mint, and owned by the signer. Balance > 0; payout > 0; no `ClaimRecord` yet. | `payout = balance × total_deposited / token_supply_snapshot`, using u128 and rounding down. The vault pays the investor, and a `ClaimRecord` is created. |
| 7 | `pause_project` | Admin | Status Active | Status becomes Paused |
| 8 | `resume_project` | Admin | Status Paused | Status becomes Active |
| 9 | `record_telemetry(date, data_hash)` | The project's `oracle_pubkey` | Status Active; no record yet for `(mint, date)` | Creates a `TelemetryRecord`; the oracle pays rent |
| 10 | `revoke_mint_authority` | Admin | `tokens_sold == token_supply` (any status) | Token-2022 `SetAuthority(MintTokens → None)`. The supply is then fixed for good. |
| 11 | `update_price(new_price_per_share)` | Admin | Status Active; new price > 0 | Updates `price_per_share` |
| 12 | `close_project` | Admin | Status is not Closed | Sends the vault's **entire** balance to the admin, including unclaimed revenue, and sets status Closed. No accounts are closed, so no rent is reclaimed. |

#### Project Lifecycle (v1)

```
initialize_project
        │
        ▼
   ┌──────────┐  pause_project   ┌──────────┐
   │  Active  │ ───────────────► │  Paused  │
   │          │ ◄─────────────── │          │
   └────┬─────┘  resume_project  └────┬─────┘
        │ close_project               │ close_project
        ▼                             ▼
   ┌──────────────────────────────────────┐
   │ Closed (final; vault swept to admin) │
   └──────────────────────────────────────┘
```

Only these instructions work while the project is **Paused** or **Closed**:
- `add_to_whitelist` and `remove_from_whitelist`
- `revoke_mint_authority`
- `resume_project` (Paused only)
- `close_project` (Paused only)

Everything that needs Active is blocked: `buy_tokens`, `deposit_revenue`, `claim_revenue`, `record_telemetry`, `update_price` and `pause_project`.

Token transfers between holders are **not** blocked in either state, because the hook does not read project status.

### Transfer Hook (v1)

Token-2022 calls `transfer_hook` on every `transfer_checked` of a share. Minting is not a transfer, so primary sales never reach the hook.

The hook reads its extra accounts from the `ExtraAccountMetaList` PDA, which is created by `initialize_extra_account_meta_list`:

```
Account index during Execute
  0  source token account
  1  mint
  2  destination token account
  3  source owner (or delegate)
  4  ExtraAccountMetaList PDA            ["extra-account-metas", mint] under transfer_hook
  5  axel program ID                     static pubkey
  6  source WhitelistEntry               ["whitelist", account 3]        under axel (index 5)
  7  destination WhitelistEntry          ["whitelist", owner field of account 2, bytes 32..64]
```

`execute` accepts the transfer only if both whitelist accounts pass three checks:
1. The account is owned by the `axel` program.
2. It is at least 10 bytes long.
3. Byte 8, the `approved` flag, equals 1.

If the source fails, the error is `SourceNotWhitelisted`. If the destination fails, the error is `DestinationNotWhitelisted`, and the whole transfer reverts.

A `fallback` handler sends the SPL transfer-hook interface's `Execute` discriminator to `execute`.

Seed 6 uses the account at index 3. For a permanent-delegate transfer that account is the delegate (the admin), so the admin's wallet must also be whitelisted.

### Security Properties (v1)

- **Primary sale:** only whitelisted wallets can buy (`buy_tokens` constraint).
- **Holder-to-holder transfers:** both wallets must be approved, or the transfer reverts (transfer hook).
- **Frozen by default:** new token accounts cannot move shares until the program thaws them.
- **Program-only authority:** minting, thawing and payouts from the vault are signed by the program's PDAs; no private key can do them.
- **Fixed supply:** `token_supply` caps minting. After `revoke_mint_authority`, the mint authority is gone for good.
- **No double claim per wallet:** `ClaimRecord` is created with `init`, so a second claim for the same period fails.
- **Checked arithmetic:** overflow is checked with `checked_*` operations; the payout uses u128.
- **Oracle-only telemetry:** only the registered oracle key can write telemetry, and only one record per project per day.

These properties are weakened by the [v1 Limitations](#v1-limitations) above, which is why v2 replaced the programs.
