# Architecture

This document describes the code as it is in this repository. Where the code and the earlier planning documents disagree, the code wins. [planning/README.md](planning/README.md) lists those differences.

## System Overview

AXEL has four parts:

- Two Anchor programs on Solana: `axel` and `transfer_hook`.
- One Token-2022 mint per car.
- A Next.js frontend that reads chain state directly. It runs on the v2 program, `axel_v2` ([v2.md](v2.md)), which is not deployed yet; this document otherwise describes v1, which is what devnet runs.
- A small NestJS backend with no database. It does the two jobs that need secrets: signing oracle telemetry and handling the KYC webhook.

```
             Investor / admin browser (Phantom or Solflare, devnet)
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────┐
│ Frontend — Next.js 14 (frontend/)                                │
│ catalog · asset page · dashboard · payouts · solvency · admin    │
│ reads accounts over JSON-RPC, builds transactions from the IDL   │
└───────┬───────────────────────────────────────────┬──────────────┘
        │ RPC reads + wallet-signed transactions    │ HTTP GET /telemetry/latest/:mint
        ▼                                           ▼
┌────────────────────────────────┐   ┌────────────────────────────────────┐
│ Solana (devnet)                │   │ Backend — NestJS 11 (backend/)     │
│                                │   │ no database, in-memory cache       │
│ axel program                   │◄──┤ telemetry cron  (oracle keypair)   │──► Yandex Fleet API
│   12 instructions, 5 acct types│ tx│ KYC webhook     (admin keypair)    │◄── Sumsub webhook
│ transfer_hook program          │   └────────────────────────────────────┘
│ Token-2022 mint (one per car)  │
└────────────────────────────────┘
```

**Golden rule (from the spec):**
- Business state lives in on-chain accounts. The frontend reads it straight from RPC, and no server keeps a copy.
- The backend keeps only an in-memory telemetry cache, up to 30 days per project, which is lost on restart.

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
backend/src/                    health, kyc, telemetry, yandex, solana modules
frontend/src/
  app/[locale]/                 routes (en default, ru, kk)
  hooks/                        chain reads and transaction hooks (axel_v2)
  lib/solana/                   axel_v2 client: cluster config, PDAs, readers, math, instruction builders, error messages, vendored IDL (idl-v2/)
  lib/api/                      telemetry and indexer HTTP clients
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

```
Yandex Fleet API              Backend (TelemetryCronService)                  Solana
      │   POST /v1/parks/orders/list  │                                          │
      │ ◄──────────────────────────── │  cron, default 01:00 daily               │
      │   completed orders, prev day  │                                          │
      │ ────────────────────────────► │  filter by licence plate                 │
      │                               │  aggregate: revenue × 0.76, km, trips    │
      │                               │  SHA-256 of canonical JSON               │
      │                               │  record_telemetry(YYYYMMDD, hash) ──────►│ TelemetryRecord PDA
      │                               │  in-memory cache (30 entries/project)    │
      │                  Frontend ───►│  GET /telemetry/latest/:mint             │
```

1. The cron needs two settings: `PROJECT_MINT` and `VEHICLE_LICENSE_PLATE`. It fetches the previous day's completed orders for the park (paginated, 500 per page). It keeps orders whose plate matches after normalization: spaces removed, upper-cased, and Cyrillic look-alike letters mapped to Latin.
2. It aggregates the matching orders into daily figures:
   - Revenue in KZT: the sum of `price`, multiplied by `NET_INCOME_FACTOR = 0.76`. This factor is a hardcoded estimate of "22% Yandex commission + 2% transaction costs".
   - Mileage in km.
   - Trip count.
   - Status: `active` if there were trips, otherwise `inactive`.
3. It hashes `JSON.stringify({date, vehicle_id, daily_revenue, mileage_km, trips_count, car_status})` with SHA-256.
4. If `ORACLE_KEYPAIR_PATH` loaded, it signs and sends `record_telemetry`. The hash on chain is a proof of existence: anyone holding the same JSON can recompute it and compare. The raw figures stay off-chain.
5. It caches the result in memory and serves it at `GET /telemetry/latest/:projectId` (see [api.md](api.md)).

**Simulated fallback.** If the Yandex credentials are missing, or the Yandex call fails, `YandexFleetService` returns **deterministic simulated data** seeded from plate and date. That data is hashed and submitted exactly like real data, and the HTTP response does not mark it as simulated. The repository contains no evidence that a live vehicle or Yandex Fleet park has been connected.

**Revenue is not linked to telemetry.** The amount passed to `deposit_revenue` is chosen by the admin. The admin panel computes it as gross revenue − expenses − maintenance reserve, entered in SOL. The program does not check that amount against the telemetry records.

## KYC Webhook Flow

```
Investor ──► Sumsub (identity check; externalUserId must be the wallet address)
                 │  POST /kyc/webhook   header x-payload-digest = HMAC-SHA256(raw body)
                 ▼
            Backend KycService
              verify signature (skipped if SUMSUB_WEBHOOK_SECRET is unset)
              act only on type == "applicantReviewed" and reviewAnswer == "GREEN"
              parse externalUserId as a Solana public key
              sign add_to_whitelist(wallet) with ADMIN_KEYPAIR_PATH (one retry)
                 │
                 ▼
            WhitelistEntry{approved: true} ──► investor can call buy_tokens
```

What the webhook does **not** do:
- A `RED` answer causes no on-chain action. The backend never calls `remove_from_whitelist`.
- It does not thaw token accounts. Thawing happens inside `buy_tokens`.

Nothing in the repository creates a Sumsub applicant, and the UI has no Sumsub link.

In practice, v1 wallets are whitelisted by calling the instruction directly. For v2, the frontend's console writes `Investor` records with `set_investor` when the connected wallet holds the KYC key or the demo KYC key; the backend's move to v2 KYC is a later step.

## Frontend

The frontend runs on `axel_v2`. The v1 client and IDL were removed from it; with v2 not deployed, devnet shows an empty catalog, and the app is used against a local validator (`NEXT_PUBLIC_SOLANA_NETWORK=localnet`).

It uses:
- Next.js 14 App Router, React 18, TypeScript and Tailwind.
- `next-intl`. Locales are `en` (default, no URL prefix), `ru` and `kk`, so for example `/ru/dashboard`.
- Wallet Adapter with Phantom and Solflare and `autoConnect`. The cluster, RPC and program ID come from the environment ([api.md](api.md#frontend-environment)).
- The client in `lib/solana/` ([api.md](api.md#typescript-client-frontend-axel_v2)). Amounts are `bigint` base units of the project's payment token and are shown with its symbol and decimals (tKZT, USDC), never in SOL; the SOL balance in the wallet menu is for fees.

| Route | What it does | Chain access |
|---|---|---|
| `/` | Landing page: figures from the chain (value sold per payment token), the catalog with filters by state, city and class (each shown once the cars differ in it), how it works, Explorer links, risks | `getProgramAccounts` for `Project`, one `getMultipleAccounts` for the share mints' metadata and the payment mints |
| `/assets/[id]` | Asset page, `id` = share mint: state, price, raise progress with a soft-cap marker, the deadline, the escrow balance read live, a timeline of the state machine, terms and holder count, the buy action, the wallet's shares with a refund for a failed raise, a public "settle the raise" once its outcome is certain, deposit history, "Check the car's data yourself", telemetry, payout calculator | `Project`, the escrow and income vault token accounts (every 15 s), the wallet's `Investor` and `Position`, the car's `Position`s, `RevenuePeriod`s; `buy_shares`, `refund` (with `finalize_raise` first when needed), `finalize_raise` |
| `/dashboard` | Portfolio: a pending recovery of the wallet's shares with a veto, value, shares, what a claim pays now; per car claim, refund, or send shares; claim all | `RecoveryRequest`s by old owner, `Position`s by owner, `Project`s; `cancel_recovery`, `claim` (up to four per transaction), `refund`, `open_position` + hooked `transfer_checked` |
| `/payouts` | Deposits of the wallet's cars and its claimed and claimable totals; with an indexer, its part of each deposit and its claims | `Position`s, `RevenuePeriod`s, or the [indexer API](api.md#indexer-api-read-by-the-frontend) |
| `/solvency` | Proof of solvency: for every car, the income vault against deposited minus claimed and what holders are owed now, the escrow against (sold − refunded) × price, the share supply against the ledger and the positions, and the revenue checkpoints; checked again every 30 s | Every `Project` and `Position`, then one `getMultipleAccounts` for each car's income vault, escrow and share mint |
| `/admin` | Console split by the keys the wallet holds. **Platform admin:** each car's state (settle, activate with the purchase documents' hash, cancel raise, pause, resume, close), its operator and oracle, share recovery (propose, run, withdraw), and the config account. **Operator:** its cars' deposits, keys, live income vault and payout history. **KYC:** looks a wallet's record up, then approves or revokes it; the demo key is stopped before it touches a record it may not change | `Config`, `Project`s, `RecoveryRequest`s, `Investor`; `finalize_raise`, `activate_project`, `cancel_raise`, `pause_project`, `resume_project`, `close_project`, `set_project_roles`, `propose_recovery`, `execute_recovery`, `cancel_recovery`, `set_investor` |

Details:

- Access comes from the roles on-chain (`hooks/useAdminRoles.ts`): `Config.admin`, `Config.kyc_authority`, `Config.demo_kyc_authority` and each project's `operator`. `/admin` is not in the navigation bar; a wallet with several roles switches between them with tabs.
- On every test network a banner under the navigation bar says the data is the fictional demo seed of `scripts/seed-devnet`; on the home page the hero says it.
- The buy button reads the wallet's `Investor` record (`hooks/useInvestor.ts`) and judges it with the program's rule (`lib/solana/eligibility.ts`): active, not expired, and DEMO only where the project accepts it. Otherwise it names the reason. The purchase dialog says where the money goes (escrow, refund rule) and discloses a payment token whose issuer can freeze, seize or pause.
- Portfolio figures use `pendingRevenue`, the program's settle on BigInt, so "Ready to claim" is exactly what a claim pays.
- A transfer reads the recipient's KYC record and position while the address is typed, refuses a wallet the hook would refuse, and adds `open_position` when the recipient has no position yet.
- A refund opens a dialog with the amount, the shares burned and the only account it can go to. When a raise has failed but nobody settled it, the refund transaction runs `finalize_raise` first.
- "Check the car's data yourself" (`components/asset/VerifyData.tsx`, `lib/verify/`) downloads the car's published files ([api.md](api.md#published-car-data-read-by-verify)), rebuilds the telemetry hash chain with the browser's WebCrypto over RFC 8785 canonical JSON, and compares it with the project's `telemetry_head`, `telemetry_count` and `last_telemetry_date`. It also checks every deposit's income report against its `report_hash`, finds the day each deposit's `telemetry_head` snapshot points to, and checks the purchase document against `acquisition_doc_hash`.
- Proof of solvency (`lib/solana/solvency.ts`) reads the accounts in several RPC calls, so a transaction can land between them; a failed check is read again once before it is reported. The rule that every share account equals its position needs every token account of every share mint and is left to the seed's `verify-invariants` script.
- Every transaction result is shown in a toast with an Explorer link. Failures are explained in the user's language: every `axel_v2` error code has a message in `messages/*.json` (`ProgramErrors`), and wallet refusals, missing SOL, expired blockhashes and RPC failures have their own (`TxErrors`).
- Revenue deposits need the oracle's co-signature, which the console cannot produce; the backend is meant to prepare them. `create_project` has no UI yet.
- Car photos are stock photos picked by make and model (`components/catalog/vehiclePhoto.ts`) and always marked "Illustrative photo": a share mint holds no photo of its car. Credits are in `public/images/CREDITS.md`. Design rules: [`frontend/design.md`](../frontend/design.md).
- Security headers are set in `next.config.mjs`: a CSP whose `connect-src` allows the public Solana clusters, Helius, a local validator, and the configured RPC, telemetry, indexer and published-data origins; `X-Frame-Options: DENY`; `nosniff`; a Referrer-Policy; and a Permissions-Policy.

## Security Properties (as implemented)

- **Primary sale:** only whitelisted wallets can buy (`buy_tokens` constraint).
- **Holder-to-holder transfers:** both wallets must be approved, or the transfer reverts (transfer hook).
- **Frozen by default:** new token accounts cannot move shares until the program thaws them.
- **Program-only authority:** minting, thawing and payouts from the vault are signed by the program's PDAs; no private key can do them.
- **Fixed supply:** `token_supply` caps minting. After `revoke_mint_authority`, the mint authority is gone for good.
- **No double claim per wallet:** `ClaimRecord` is created with `init`, so a second claim for the same period fails.
- **Checked arithmetic:** overflow is checked with `checked_*` operations; the payout uses u128.
- **Oracle-only telemetry:** only the registered oracle key can write telemetry, and only one record per project per day.

## Known Limitations

These come from reading the v1 code on 2026-09-24. The program items are fixed in `axel_v2` ([v2.md](v2.md#v1-limitation--v2-fix)); the frontend items 7 and 8 were fixed when the frontend moved to v2.

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
5. **The backend's `record_telemetry` transaction fails.**
   - The hand-built instruction in `telemetry-cron.service.ts` passes five accounts: `oracle, project_state, mint, telemetry_record, system_program`.
   - The program expects four: `oracle, project_state, telemetry_record, system_program`.
   - The extra `mint` shifts the order, so the telemetry PDA check fails.
   - The retry path then caches the data without a transaction signature.
6. **Simulated telemetry is not flagged.** See [Oracle / Telemetry Flow](#oracle--telemetry-flow).
7. **The telemetry widget did not reach the backend.** It fetched `${NEXT_PUBLIC_API_URL}/telemetry/latest/:mint`, a variable no example file set, and it kept showing the first car's data after moving to another car. The v2 frontend reads `NEXT_PUBLIC_TELEMETRY_API_URL`, makes no request when it is unset, and reads again when the car changes. The backend still does not enable CORS, so it must be served from the frontend's origin or add CORS.
8. **The whitelist status hook always returned false.** `useWhitelistStatus` passed the whitelist PDA where the reader expected the wallet. It is gone; the v2 frontend reads `Investor` records with `useInvestor`.
9. **The revenue vault is subject to rent rules.** The vault is a 0-byte system account, so Solana's rent-state rules apply. A deposit that would leave an empty vault below the rent-exempt minimum (890,880 lamports) is rejected. So is a claim that would leave a non-zero balance below that minimum. Rounding dust can therefore block the last claim of a period, unless the vault holds extra SOL.
10. **Transfer-fee rounding.** Token-2022 rounds the fee up, and shares have 0 decimals, so every transfer pays at least one whole share. A 1-share transfer delivers nothing to the recipient.
11. **The admin holds strong powers.** The admin receives all sale proceeds immediately and sweeps the vault on close. The admin is also the permanent delegate: it can move or burn any holder's shares with Token-2022 directly. On devnet these are single keys. The code comment mentions a Squads multisig for production, but none is configured.
