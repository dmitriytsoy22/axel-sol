# Architecture

This document describes the code as it is in this repository. Where the code and the earlier planning documents disagree, the code wins. [planning/README.md](planning/README.md) lists those differences.

## System Overview

AXEL has four parts:

- Two Anchor programs on Solana: `axel` and `transfer_hook`.
- One Token-2022 mint per car.
- A Next.js frontend that reads chain state directly.
- A small NestJS backend. It does the jobs that need secrets or a server:
  - binding wallets to Sumsub applicants and writing their v2 KYC records;
  - the daily telemetry job, which publishes each car's day and appends its hash to the v2 chain as the project's oracle;
  - co-signing revenue deposits whose report matches the published data;
  - indexing the history of v2 program events for project timelines and claim histories.

  It keeps KYC state, the published days, the attested reports and the indexed events in one SQLite file.

```
             Investor / admin browser (Phantom or Solflare, devnet)
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│ Frontend — Next.js 14 (frontend/)                                │
│ catalog · asset page · dashboard · payouts · admin panel         │
│ reads accounts over JSON-RPC, builds transactions from the IDL   │
└───────┬───────────────────────────────────────────┬──────────────┘
        │ RPC reads + wallet-signed transactions    │ HTTP /telemetry/*, /reports/*, /events
        ▼                                           ▼
┌────────────────────────────────┐   ┌────────────────────────────────────┐
│ Solana (devnet)                │   │ Backend — NestJS 11 (backend/)     │
│                                │   │ SQLite: KYC, published days,       │
│ axel program                   │   │   attested reports, event index    │
│   12 instructions, 5 acct types│   │ telemetry job                      │──► Yandex Fleet API
│ axel_v2 program (not deployed) │◄──┤   record_telemetry (oracle key)    │
│ transfer_hook program          │ tx│ reports: co-sign deposit_revenue   │
│ Token-2022 mint (one per car)  │   │ KYC sign-in + Sumsub webhook       │◄── Sumsub webhook
│                                │   │   set_investor (KYC authority key) │
│                                ├──►│ event indexer                      │
└────────────────────────────────┘ ws│   logsSubscribe + history (RPC)    │
                                     └────────────────────────────────────┘
```

**Golden rule (from the spec):**
- Business state lives in on-chain accounts. The frontend reads it straight from RPC, and no server keeps a copy.
- The backend's SQLite file holds:
  - sign-in nonces, which wallet belongs to which Sumsub applicant, and a log of webhook events;
  - the published text of every telemetry day, with its place in the chain;
  - the revenue reports the oracle attested;
  - an index of the v2 program's events. It is a copy of chain history for timelines, not state: balances and project states are still read from the accounts, and the index can be rebuilt from the chain.

  KYC status itself lives in the v2 `Investor` accounts. The telemetry chain head and each deposit's report hash live in `Project` and `RevenuePeriod`, so the stored texts can always be checked against the chain.

## Repository Layout

```
programs/
  axel/src/
    lib.rs                      entry point, 12 instructions
    errors.rs                   AxelError (codes 6000–6019)
    state/                      ProjectState, RevenuePeriod, ClaimRecord, WhitelistEntry, TelemetryRecord
    instructions/admin/         initialize_project, whitelist, deposit_revenue, pause_resume,
                                revoke_mint_authority, update_price, close_project
    instructions/investor/      buy_tokens, claim_revenue
    instructions/oracle/        record_telemetry
  transfer-hook/src/lib.rs      execute, fallback, initialize_extra_account_meta_list
tests/                          12 integration test files (node:test, local validator at 127.0.0.1:8899)
scripts/                        init-project.ts (seed a project), generate-clients.ts (Codama)
sdk/axel-v2/                    Codama TypeScript client of the v2 program (see v2.md)
backend/src/                    health, kyc, fleet (Yandex Fleet client, simulator), telemetry, reports, indexer, solana modules
frontend/src/
  app/[locale]/                 routes (en default, ru, kk)
  hooks/                        chain reads and transaction hooks
  lib/solana/                   connection, PDA derivation, readers, instruction builders, vendored IDL (idl/ v1, idl-v2/ v2)
  lib/api/                      telemetry HTTP client
Anchor.toml                     program IDs for localnet and devnet; provider cluster = devnet
```

Toolchain pins:
- Anchor 0.32.1
- `spl-token-2022` 8
- `rust-toolchain.toml` pins Rust 1.89.0

## Deployed Programs (devnet)

| Program | ID |
|---|---|
| axel | [`DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`](https://explorer.solana.com/address/DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M?cluster=devnet) |
| transfer_hook | [`5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`](https://explorer.solana.com/address/5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ?cluster=devnet) |

On 2026-09-24, devnet held two `ProjectState` accounts. Both were created by `scripts/init-project.ts` and carry its test metadata:
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

## Token-2022 Mint

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
- **Transfer fee:** withheld in shares, not SOL, in the recipient's token account. No program instruction or UI collects withheld fees yet. The admin could withdraw them with standard Token-2022 instructions as the withdraw-withheld authority.
- **Memo Transfer:** not enabled. It was in the spec but is not in the code.
- **Hook setup:** the mint does not create the hook's `ExtraAccountMetaList`. That account must be created separately with `transfer_hook.initialize_extra_account_meta_list` (see [Known Limitations](#known-limitations)).

## Accounts and PDAs

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

## Instructions (`axel` program)

There are 12 instructions. "Admin" means `ProjectState.admin`, enforced with Anchor `has_one = admin`.

| # | Instruction | Who can call | Preconditions | Effect |
|---|---|---|---|---|
| 1 | `initialize_project(params)` | Any wallet; it becomes the project admin. The new mint keypair also signs. | `price_per_share > 0`; `car_cost % price_per_share == 0` | Creates the Token-2022 mint (6 extensions, metadata) and `ProjectState` (Active, `token_supply = car_cost / price_per_share`, `tokens_sold = 0`) |
| 2 | `add_to_whitelist(wallet)` | **Any signer.** There is no admin check (see Known Limitations). | — | Creates or updates `WhitelistEntry{approved: true}`; the signer pays rent (`init_if_needed`) |
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

### Project Lifecycle

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

## Transfer Hook

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

## Oracle / Telemetry Flow

This is the v2 flow. The backend no longer sends anything to the v1 program.

```
Yandex Fleet API / simulator      Backend                                          Solana (axel_v2)
      │ orders, driver profiles,  │ daily job (CRON_SCHEDULE)                        │
      │ rent transactions         │ 1. collect each car's missing days (≤ 31 back)   │
      │ ◄──────────────────────── │    → day record, RFC 8785 text, SHA-256          │
      │                           │    → SQLite, published at /telemetry/...         │
      │                           │ 2. record_telemetry, ≤ 20 days per tx ─────────► │ Project.telemetry_head
      │                           │                                                  │
 operator wallet ── POST /reports/draft ──► report from published days + expenses    │
 operator wallet ── POST /reports/attest (signed deposit) ──► checks, oracle co-signs│
 operator wallet ── sends deposit_revenue ─────────────────────────────────────────► │ RevenuePeriod.report_hash
```

1. **Cars.** `FLEET_CONFIG` maps each share mint to a plate, a source (`yandex_fleet` or `simulated`) and the park's fee. The day boundaries follow `FLEET_UTC_OFFSET` (Kazakhstan, `+05:00`).
2. **Collecting.** For every car the job reads each finished day it does not have yet, oldest first.
   - With Yandex Fleet:
     - trips and distance come from the park's completed orders, matched by plate (spaces removed, upper-cased, Cyrillic look-alikes mapped to Latin);
     - the rent comes from the park's rent-charge transactions for the drivers currently assigned to the car.
   - If a request fails, the car stops at that day and nothing is invented.
   - Simulated cars use a deterministic generator, and their records say `data_origin: "simulated"`.
3. **Publishing.** Each day becomes a record whose RFC 8785 text is stored as is, served at `GET /telemetry/:mint/:date.json`, and hashed with SHA-256. The text never changes once collected.
4. **Recording.** The oracle key appends the days to the project's chain with `record_telemetry`, 20 per transaction. Each signed batch is stored before it is sent, so after a crash the next run can tell whether it landed.
   - It writes only while the project is Operating or Paused, and only if the project's oracle is its key.
   - It stops if the chain holds a head it did not write.
   - `GET /telemetry/:mint/proof?date=` gives a day's text, hash, chain position, heads and transaction.
5. **Attesting revenue.**
   - The operator asks for a draft report for a period. The report adds up the rent from the published days, subtracts the park's fee and the operator's maintenance and insurance items (each with an optional document hash), and gives the deposit amount.
   - The operator's wallet signs `deposit_revenue` with that report's hash and amount.
   - The backend rebuilds the report and checks the transaction (only that deposit, nothing else for the oracle to sign). It refuses a period that overlaps an earlier deposit, then adds the oracle's signature.
   - The report is published at `/reports/:mint/:hash.json`, and its hash is in the deposit's `RevenuePeriod`.

[api.md](api.md#telemetry-what-is-published) has the record and report formats, the status codes and every check.

**What this does and does not prove.**
- It proves that the deposit pays out exactly the published report. The report's income comes only from days whose hashes are in the chain, and simulated data is marked as such, inside the hashed text.
- It does not prove that the fleet system reported the truth, or that the operator's expense items are complete. The oracle is one backend key, and the Yandex rent attribution uses the drivers' current car assignment.

## Event Indexer (v2)

The backend indexes the events `axel_v2` emits, so the frontend can show a car's timeline and an investor's payouts without scanning the chain itself. Endpoints: [api.md](api.md#program-events-what-is-indexed).

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

## KYC Flow (v2)

The backend writes v2 `Investor` records with its own key, `Config.kyc_authority`. That key signs nothing else, and the admin key is not on the server.

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

v2 is not deployed yet, so these records exist only on a local validator or LiteSVM. v1 wallets are still approved from the admin panel (`WhitelistManager`) or by calling `add_to_whitelist` directly; the backend no longer calls v1.

## Frontend

The frontend uses:
- Next.js 14 App Router, React 18, TypeScript and Tailwind.
- `next-intl`. Locales are `en` (default, no URL prefix), `ru` and `kk`, so for example `/ru/dashboard`.
- Wallet Adapter with Phantom and Solflare, `autoConnect`, and devnet RPC by default.

| Route | What it does | Chain access |
|---|---|---|
| `/` | Landing page: figures from the chain, the catalog of all projects (with a status filter once cars differ in status), how it works, Explorer links to verify the program, risks | `program.account.projectState.all()` plus Token-2022 metadata for each mint, read once and shared by every section |
| `/assets/[id]` | Asset page: car metadata, sale progress, price, terms with Explorer links (mint, vault, operator, oracle), buy panel and invest modal, the car's payout history, a payout calculator on the reader's own inputs, telemetry widget. `id` is the mint address or the list index. | The wallet's `WhitelistEntry`, the project's `RevenuePeriod`s; `buy_tokens` |
| `/dashboard` | Portfolio: holdings, revenue periods with claim status, claim / claim-all | ATA balances, `RevenuePeriod`, `ClaimRecord`; `claim_revenue` (claim-all packs several claims into one transaction) |
| `/payouts` | Payout history across the wallet's holdings | `RevenuePeriod`, `ClaimRecord` |
| `/admin` | Metrics, whitelist manager, revenue deposit form, pause / resume / close | `add_to_whitelist`, `remove_from_whitelist`, `deposit_revenue`, `pause_project`, `resume_project`, `close_project` |

Details:

- `/admin` is not in the navigation bar. `useAdminAccess` shows the panel only when the connected wallet is the admin of the **first** project returned by the catalog query; other visitors see why the panel is unavailable. The panel manages only that project.
- The buy button either connects a wallet or, during an open sale, buys with a wallet whose `WhitelistEntry` is approved. In every other case it is disabled and states the reason. The asset page reads the entry with `components/asset/useWalletApproval.ts`, not with the broken `useWhitelistStatus` (limitation 8).
- `lib/solana/instructions.ts` also has a builder for `update_price`, but no component uses it.
- `initialize_project` and `revoke_mint_authority` have no UI. Projects are created with `npm run init-project`.
- Car photos are stock photos picked by make and model (`components/catalog/vehiclePhoto.ts`) and marked "Illustrative photo". Credits are in `public/images/CREDITS.md`. Design rules: [`frontend/design.md`](../frontend/design.md).
- Security headers are set in `next.config.mjs`: a CSP whose `connect-src` allows Solana devnet and mainnet RPC, Helius and `http://localhost:*`; `X-Frame-Options: DENY`; `nosniff`; a Referrer-Policy; and a Permissions-Policy.

## Security Properties (as implemented)

- **Primary sale:** only whitelisted wallets can buy (`buy_tokens` constraint).
- **Holder-to-holder transfers:** both wallets must be approved, or the transfer reverts (transfer hook).
- **Frozen by default:** new token accounts cannot move shares until the program thaws them.
- **Program-only authority:** minting, thawing and payouts from the vault are signed by the program's PDAs; no private key can do them.
- **Fixed supply:** `token_supply` caps minting. After `revoke_mint_authority`, the mint authority is gone for good.
- **No double claim per wallet:** `ClaimRecord` is created with `init`, so a second claim for the same period fails.
- **Checked arithmetic:** overflow is checked with `checked_*` operations; the payout uses u128.
- **Oracle-only telemetry:** only the registered oracle key can write telemetry, and only one record per project per day (v1). In v2 the oracle appends to a hash chain with strictly increasing dates, and co-signs every revenue deposit.

## Known Limitations

These come from reading the code on 2026-09-24. None of the program's limitations is fixed in v1. Items 5 and 6 are fixed in the backend, which now serves the v2 program only.

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
7. **The telemetry widget does not reach the backend.**
   - `useTelemetry` fetches `${NEXT_PUBLIC_API_URL}/telemetry/latest/:mint`. That variable is not in `.env.local.example`, and when it is empty the request goes to the Next.js origin, which has no such route.
   - The separate client `lib/api/telemetry.ts` uses `NEXT_PUBLIC_TELEMETRY_API_URL`, but no component calls it.
   - The backend allows only the origins in `CORS_ORIGINS` (default `http://localhost:3000`).
8. **The whitelist status hook always returns false.** `useWhitelistStatus` derives the whitelist PDA and then passes it to `fetchWhitelistEntry`, which derives a PDA again from that address. Nothing calls it any more: the asset page uses its own correct reader, `components/asset/useWalletApproval.ts`.
9. **The revenue vault is subject to rent rules.** The vault is a 0-byte system account, so Solana's rent-state rules apply. A deposit that would leave an empty vault below the rent-exempt minimum (890,880 lamports) is rejected. So is a claim that would leave a non-zero balance below that minimum. Rounding dust can therefore block the last claim of a period, unless the vault holds extra SOL.
10. **Transfer-fee rounding.** Token-2022 rounds the fee up, and shares have 0 decimals, so every transfer pays at least one whole share. A 1-share transfer delivers nothing to the recipient.
11. **The admin holds strong powers.** The admin receives all sale proceeds immediately and sweeps the vault on close. The admin is also the permanent delegate: it can move or burn any holder's shares with Token-2022 directly. On devnet these are single keys. The code comment mentions a Squads multisig for production, but none is configured.
