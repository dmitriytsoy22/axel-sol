# API Reference

AXEL exposes two interfaces:

1. **A small HTTP backend** with five endpoints, in `backend/`.
2. **The `axel` and `transfer_hook` Solana programs.** Clients call them directly.

All business actions (buy, deposit, claim, whitelist, pause and so on) are Solana transactions. The backend is not in that path, with one exception: it signs v2 `set_investor` after a Sumsub review.

## Backend HTTP Endpoints

- Stack: NestJS 11 (`backend/src`), SQLite through `better-sqlite3` for KYC state.
- Default port: `3000` (`PORT`).
- CORS: only the origins in `CORS_ORIGINS`, methods `GET` and `POST`.
- Errors use the NestJS shape: `{ "statusCode": 400, "message": "...", "error": "Bad Request" }`.
- Run a single instance: the per-wallet ordering of webhook events and the rate limits live in the process.

### Health Check

```
GET /health
```

Checks that the RPC answers (`getSlot`) and whether the KYC flow is configured.

**Response `200`:**
```json
{ "status": "ok", "rpc": "connected", "kyc": "ready" }
```
`kyc` is `"not_configured"` unless `SUMSUB_WEBHOOK_SECRET`, `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` and the KYC authority keypair are all set.

**Response `503`** (RPC unreachable):
```json
{ "status": "error", "rpc": "disconnected", "kyc": "ready" }
```

### Latest Telemetry

```
GET /telemetry/latest/:projectId
```

`projectId` is the project's mint address in base58. It must equal the backend's `PROJECT_MINT`, because the cache is keyed by that value. The endpoint returns the newest cached day for the project. The cache is in memory, holds up to 30 days per project, and is filled only by the cron job, so it is empty after a restart until the next run.

**Response `200`** (`TelemetryResponse` in `backend/src/telemetry/telemetry.controller.ts`):
```ts
interface TelemetryResponse {
  date: string;                     // "YYYY-MM-DD" (UTC), the day the figures cover
  dailyRevenue: number;             // KZT, sum of order prices × 0.76, rounded
  mileageKm: number;                // integer km
  tripsCount: number;               // completed orders matched to the licence plate
  carStatus: string;                // "active" | "inactive" ("maintenance" exists in the type, never produced)
  dataHash: string;                 // hex SHA-256 of the canonical JSON (see below)
  solanaTxSignature: string | null; // always null: the backend writes no telemetry on-chain yet
  stale: boolean;                   // true if `date` is neither today nor yesterday (UTC)
  available: boolean;               // false when nothing is cached for this project
}
```

When nothing is cached, the endpoint still returns `200` with this body:

```json
{ "date": "", "dailyRevenue": 0, "mileageKm": 0, "tripsCount": 0, "carStatus": "", "dataHash": "", "solanaTxSignature": null, "stale": false, "available": false }
```

The hashed payload is exactly:

```ts
JSON.stringify({ date, vehicle_id, daily_revenue, mileage_km, trips_count, car_status })
```

Here `vehicle_id` is the configured licence plate, and `daily_revenue` is the same number as `dailyRevenue`. The response does **not** say whether the figures came from Yandex or from the simulated fallback ([architecture.md](architecture.md#oracle--telemetry-flow)).

### KYC Sign-In Nonce

```
GET /kyc/nonce?wallet=<base58 public key>
```

Returns a [Sign-In With Solana](https://github.com/phantom/sign-in-with-solana) message for the wallet to sign with `signMessage`. The nonce is single-use and expires after 5 minutes. Limit: 10 requests a minute per client IP.

**Response `200`:**
```json
{
  "wallet": "<base58>",
  "nonce": "9881299645de7120aa4a2c87a7e0f3e8",
  "message": "axel.example wants you to sign in with your Solana account:\n<base58>\n\nLink this wallet to your AXEL identity check. Only this wallet will be approved to hold AXEL shares.\n\nURI: https://axel.example\nVersion: 1\nChain ID: devnet\nNonce: 9881…\nIssued At: 2026-09-25T08:49:49.946Z\nExpiration Time: 2026-09-25T08:54:49.946Z",
  "expiresAt": "2026-09-25T08:54:49.946Z"
}
```
The domain and URI come from `SIWS_URI`, the chain ID from `SOLANA_CLUSTER`.

**Response `400`:** `wallet` is missing or not a canonical base58 public key. **`429`:** rate limit.

### KYC Session

```
POST /kyc/session
Content-Type: application/json

{ "wallet": "<base58>", "nonce": "<from /kyc/nonce>", "signature": "<base58 ed25519 signature of message>" }
```

Checks the signature over the stored message, burns the nonce (also when the check fails), and binds the wallet to a Sumsub applicant. The first session creates a random `externalUserId` (`axel-<uuid>`); later sessions of the same wallet reuse it. Limit: 5 requests a minute per client IP.

**Response `200`:**
```json
{
  "wallet": "<base58>",
  "externalUserId": "axel-2f0c…",
  "levelName": "basic-kyc-level",
  "accessToken": "<Sumsub WebSDK access token>",
  "accessTokenExpiresAt": "2026-09-25T09:19:49.946Z"
}
```
Pass `accessToken` to the Sumsub WebSDK. It is valid for 30 minutes; a new session gives a new one.

| Status | When |
|---|---|
| `400` | body fields missing or malformed |
| `401` | `Unknown, used or expired nonce` (also a nonce issued for another wallet), or `Signature does not match the wallet` |
| `502` | the Sumsub API failed; details are only in the server log |
| `503` | `SUMSUB_APP_TOKEN` or `SUMSUB_SECRET_KEY` is not set |

### KYC Webhook (Sumsub)

```
POST /kyc/webhook
X-Payload-Digest: <hex HMAC of the raw request body, key = SUMSUB_WEBHOOK_SECRET>
X-Payload-Digest-Alg: HMAC_SHA1_HEX | HMAC_SHA256_HEX | HMAC_SHA512_HEX
```

The HMAC is computed over the exact bytes received and compared with `crypto.timingSafeEqual`. A missing or unknown algorithm fails the check. There is no bypass: without a secret every request gets `503`.

**What happens:**

| Event | Action |
|---|---|
| `applicantReviewed`, `GREEN` | The backend fetches the applicant from the Sumsub API and continues only if it has the same `externalUserId`, `reviewStatus == "completed"`, answer `GREEN` and level `SUMSUB_LEVEL_NAME`. Then `set_investor(Active)`: expiry 12 calendar months from now, jurisdiction = ISO 3166 numeric code of `info.country` (else `fixedInfo.country`, else 0), provider `Sumsub`, DEMO flag cleared. |
| `applicantReviewed`, `RED` with `reviewRejectType == "FINAL"` | `set_investor(Revoked)` |
| `applicantReset`, `applicantDeactivated` | `set_investor(Revoked)` |
| anything else, `RED` with `RETRY` | nothing |

Rules applied before any transaction:
- The wallet is the one bound to `externalUserId` by `/kyc/session`. Unknown users are ignored.
- Events for one wallet are handled one at a time. An event whose `createdAtMs` is older than the last one applied for that wallet is ignored.
- The current `Investor` account is read first. Nothing is sent when the record would not change: an approval of a wallet that is already active through Sumsub with the same jurisdiction and flags, and whose expiry is at most 30 days before the new one; a revocation of a record that is already revoked or does not exist.
- A `Frozen` record is never changed (`blocked`). Revocations touch only records whose provider is `Sumsub`.
- The transaction is signed and paid by the KYC authority key (`KYC_AUTHORITY_KEYPAIR_PATH`), which must equal `Config.kyc_authority`.

**Response `200`:**
```json
{ "outcome": "applied", "reason": "approved", "solanaTxSignature": "<signature>" }
```

| `outcome` | `reason` values |
|---|---|
| `applied` | `approved`, `rejected`, `reset`, `deactivated` |
| `unchanged` | `already_active`, `already_revoked`, `no_record`, `not_granted_by_sumsub` |
| `blocked` | `frozen` |
| `ignored` | `event_type`, `review_not_final`, `missing_applicant`, `unknown_user`, `stale_event`, `not_approved`, `level_mismatch`, `applicant_mismatch` |

Every verified event is stored in the `kyc_events` table with its outcome and transaction signature.

**Errors.** Sumsub retries any answer other than 2xx, and retries are safe:
- `400`: the signed body is not a JSON object or has no `type`.
- `401`: `Invalid webhook signature`.
- `500`: the RPC failed or the transaction failed on-chain.
- `502`: the Sumsub API failed.
- `503`: the webhook secret or the KYC authority key is not configured.

### Backend Configuration

`backend/.env.example` lists every variable. The values are validated at startup; an invalid value stops the process. With `NODE_ENV=production` the backend refuses to start without `AXEL_PROGRAM_ID`, `CORS_ORIGINS`, `SIWS_URI`, `KYC_AUTHORITY_KEYPAIR_PATH`, `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET` and `SUMSUB_LEVEL_NAME`, and it requires https origins.

| Variable | Used by | Default / behaviour when unset |
|---|---|---|
| `PORT` | `main.ts` | `3000` |
| `CORS_ORIGINS` | CORS | `http://localhost:3000` |
| `TRUST_PROXY` | client IP for rate limits | `0` |
| `SOLANA_RPC_URL` | `SolanaService` | `http://127.0.0.1:8899` |
| `SOLANA_CLUSTER` | sign-in message | `devnet` |
| `AXEL_PROGRAM_ID` | v2 program client | `address` of `src/solana/idl/axel_v2.json` |
| `DATABASE_PATH` | SQLite file | `data/axel-backend.sqlite` |
| `KYC_AUTHORITY_KEYPAIR_PATH` | `set_investor` signer | webhook answers `503`; an unreadable file stops the start |
| `SIWS_URI` | sign-in message domain and URI | `http://localhost:3000` |
| `SUMSUB_BASE_URL` | Sumsub API | `https://api.sumsub.com` |
| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` | Sumsub API | `/kyc/session` answers `503` |
| `SUMSUB_LEVEL_NAME` | WebSDK level, approval check | `basic-kyc-level` |
| `SUMSUB_WEBHOOK_SECRET` | webhook HMAC | webhook answers `503` |
| `PROJECT_MINT` | telemetry cron | Cron skips ingestion |
| `VEHICLE_LICENSE_PLATE` | telemetry cron | Cron skips ingestion |
| `YANDEX_PARK_ID`, `YANDEX_CLIENT_ID`, `YANDEX_API_KEY` | `YandexFleetService` | Simulated telemetry |
| `CRON_SCHEDULE` | telemetry job, registered after `.env` is loaded | `0 1 * * *` (daily 01:00, server time) |

The v2 program ID comes from `AXEL_PROGRAM_ID` or the vendored IDL; instructions are built with `@coral-xyz/anchor` from that IDL. `npm run export-idl` in the repository root refreshes the backend copy together with the frontend one.

## Frontend Environment

`frontend/.env.local.example` lists these variables:

| Variable | Read in | Notes |
|---|---|---|
| `NEXT_PUBLIC_SOLANA_RPC_URL` | `lib/solana/connection.ts`, `providers/WalletProvider.tsx` | Defaults to devnet |
| `NEXT_PUBLIC_SOLANA_NETWORK` | `lib/solana/connection.ts`, `app/opengraph-image.tsx` | Used for Explorer links and the social card; default `devnet` |
| `NEXT_PUBLIC_PROGRAM_ID` | `lib/solana/connection.ts` | Defaults to `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M` |
| `NEXT_PUBLIC_TELEMETRY_API_URL` | `lib/api/telemetry.ts` | That client is not used by any component |
| `NEXT_PUBLIC_KYC_URL` | — | Not read anywhere |

The asset page's telemetry widget (`hooks/useTelemetry.ts`) reads `NEXT_PUBLIC_API_URL`, which is not in the example file.

## Program Reference: `axel`

- Program ID: `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`
- IDL: [`frontend/src/lib/solana/idl/axel.json`](../frontend/src/lib/solana/idl/axel.json), fetched from devnet
- TypeScript type: `idl/axel.ts`

Anchor instruction discriminators are the first 8 bytes of `sha256("global:<instruction_name>")`.

How to read the account lists:
- Accounts are listed in order.
- `mut` means writable; `signer` means the account must sign.
- In PDA seeds, `u32` values are 4 little-endian bytes.

For who may call each instruction and what it changes, see [architecture.md](architecture.md#instructions-axel-program).

### `initialize_project(params: InitializeProjectParams)`

`admin` (mut, signer) · `mint` (mut, signer, new keypair) · `project_state` (mut, PDA `["project", mint]`) · `revenue_vault` (PDA `["revenue", mint]`) · `token_extensions_program` (Token-2022) · `system_program`

```ts
type InitializeProjectParams = {
  car_cost_lamports: u64;          // token_supply = car_cost_lamports / price_per_share_lamports (must divide exactly)
  price_per_share_lamports: u64;   // > 0
  transfer_hook_program_id: pubkey;
  oracle_pubkey: pubkey;
  token_name: string;
  token_symbol: string;
  token_uri: string;
  vin: string;                     // the five fields below become TokenMetadata additional fields
  make: string;
  model: string;
  year: u16;
  valuation_sol: u64;              // stored as a decimal string; scripts/init-project.ts passes lamports
};
```

Errors: `ZeroPricePerShare`, `InvalidTokenSupplyDivision`.

### `add_to_whitelist(wallet: pubkey)`

`admin` (mut, signer; pays rent; **not checked** against any project) · `whitelist_entry` (mut, PDA `["whitelist", wallet]`, `init_if_needed`) · `system_program`

### `remove_from_whitelist(wallet: pubkey)`

`admin` (signer; **not checked**) · `whitelist_entry` (mut, PDA `["whitelist", wallet]`, must exist)

### `buy_tokens(token_amount: u64)`

`investor` (mut, signer) · `admin` (mut, must equal `project_state.admin`; receives SOL) · `project_state` (mut, PDA `["project", project_state.mint]`, status Active) · `mint` (mut, must equal `project_state.mint`) · `investor_token_account` (mut; the investor's Token-2022 ATA, created if empty) · `whitelist_entry` (PDA `["whitelist", investor]`, `approved == true`) · `token_extensions_program` · `associated_token_program` · `system_program`

Errors: `ProjectNotActive`, `InvestorNotWhitelisted`, `ZeroPurchase`, `InsufficientVaultBalance` (not enough unsold shares), `Overflow`.

### `deposit_revenue(period_index: u32, amount: u64)`

`admin` (mut, signer, `has_one`) · `project_state` (mut, PDA `["project", project_state.mint]`, status Active) · `revenue_vault` (mut, must equal `project_state.revenue_vault`) · `revenue_period` (mut, `init`, PDA `["revenue_period", project_state.mint, period_index]`) · `system_program`

Errors: `Unauthorized`, `ProjectNotActive`, `InvalidRevenueVault`, `ZeroDepositAmount`, `InvalidPeriodIndex` (must equal `period_count`), `NoTokensSold`, `Overflow`.

### `claim_revenue(period_index: u32)`

`investor` (mut, signer; pays rent for the claim record) · `project_state` (PDA `["project", project_state.mint]`, status Active) · `revenue_period` (PDA `["revenue_period", project_state.mint, period_index]`) · `revenue_vault` (mut, must equal `project_state.revenue_vault`) · `claim_record` (mut, `init`, PDA `["claim", revenue_period, investor]`) · `investor_token_account` (owned by Token-2022; mint and owner are checked in the handler) · `token_extensions_program` · `system_program`

Errors: `ProjectNotActive`, `RevenuePeriodMismatch`, `InvalidRevenueVault`, `InvalidTokenAccount`, `ZeroTokenBalance`, `ZeroPayout`, `Overflow`. A second claim by the same wallet fails because `claim_record` already exists.

### `pause_project()` / `resume_project()`

`admin` (signer, `has_one`) · `project_state` (mut, PDA `["project", project_state.mint]`)

Errors: `Unauthorized`, `ProjectNotActive` (pause), `ProjectNotPaused` (resume).

### `record_telemetry(date: u32, data_hash: [u8; 32])`

`oracle` (mut, signer; must equal `project_state.oracle_pubkey`; pays rent) · `project_state` (PDA `["project", project_state.mint]`, status Active) · `telemetry_record` (mut, `init`, PDA `["telemetry", project_state.mint, date]`) · `system_program`

`date` is `YYYYMMDD` as an integer, e.g. `20260401`.

Errors: `ProjectNotActive`, `UnauthorizedOracle`. A second record for the same day fails because the PDA already exists.

### `revoke_mint_authority()`

`admin` (signer, `has_one`) · `project_state` (PDA `["project", project_state.mint]`) · `mint` (mut, must equal `project_state.mint`) · `token_extensions_program`

Errors: `Unauthorized`, `TokensStillAvailable` (requires `tokens_sold == token_supply`).

### `update_price(new_price_per_share: u64)`

`admin` (signer, `has_one`) · `project_state` (mut, PDA `["project", project_state.mint]`, status Active)

Errors: `ZeroPricePerShare`, `ProjectNotActive`. A wrong signer fails with Anchor's `ConstraintHasOne`, because this `has_one` has no custom error.

### `close_project()`

`admin` (mut, signer, `has_one`; receives the vault balance) · `project_state` (mut, PDA `["project", project_state.mint]`) · `revenue_vault` (mut, PDA `["revenue", project_state.mint]`) · `system_program`

Errors: `ProjectAlreadyClosed`. A wrong signer fails with `ConstraintHasOne`.

### Accounts

| Account | Layout after the 8-byte discriminator |
|---|---|
| `ProjectState` | `admin: pubkey`, `mint: pubkey`, `revenue_vault: pubkey`, `token_supply: u64`, `tokens_sold: u64`, `price_per_share: u64`, `status: enum {Active, Paused, Closed}`, `period_count: u32`, `oracle_pubkey: pubkey`, `bump: u8`, `revenue_vault_bump: u8` |
| `RevenuePeriod` | `project: pubkey` (the mint), `period_index: u32`, `total_deposited: u64`, `token_supply_snapshot: u64`, `deposited_at: i64`, `bump: u8` |
| `ClaimRecord` | `claimed: bool`, `bump: u8` |
| `WhitelistEntry` | `approved: bool`, `bump: u8` |
| `TelemetryRecord` | `project: pubkey` (the mint), `date: u32`, `data_hash: [u8; 32]`, `oracle_pubkey: pubkey`, `recorded_at: i64`, `bump: u8` |

### Errors (`AxelError`)

| Code | Name | Code | Name |
|---|---|---|---|
| 6000 | `InvalidTokenSupplyDivision` | 6010 | `InvalidPeriodIndex` |
| 6001 | `ZeroPricePerShare` | 6011 | `NoTokensSold` |
| 6002 | `ProjectNotActive` | 6012 | `RevenuePeriodMismatch` |
| 6003 | `InvestorNotWhitelisted` | 6013 | `InvalidTokenAccount` |
| 6004 | `ZeroPurchase` | 6014 | `ZeroTokenBalance` |
| 6005 | `InsufficientVaultBalance` | 6015 | `ZeroPayout` |
| 6006 | `Overflow` | 6016 | `ProjectNotPaused` |
| 6007 | `Unauthorized` | 6017 | `UnauthorizedOracle` |
| 6008 | `InvalidRevenueVault` | 6018 | `TokensStillAvailable` |
| 6009 | `ZeroDepositAmount` | 6019 | `ProjectAlreadyClosed` |

## Program Reference: `transfer_hook`

- Program ID: `5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`
- Its IDL is produced by `anchor build` at `target/idl/transfer_hook.json`. It is not vendored in the frontend.

| Instruction | Accounts | Notes |
|---|---|---|
| `initialize_extra_account_meta_list()` | `payer` (mut, signer) · `mint` · `extra_account_meta_list` (mut, PDA `["extra-account-metas", mint]`) · `system_program` | Any payer. It must run once per mint before holder-to-holder transfers can work. |
| `execute(amount: u64)` | source token account · mint · destination token account · source owner · `extra_account_meta_list` · axel program · source `WhitelistEntry` · destination `WhitelistEntry` | Called by Token-2022 during `transfer_checked`, not by clients. A `fallback` handler routes the SPL transfer-hook interface discriminator here. |

Errors: `6000 SourceNotWhitelisted`, `6001 DestinationNotWhitelisted`.

To send shares from a client, build the transfer with `createTransferCheckedWithTransferHookInstruction` or `transferCheckedWithTransferHook` from `@solana/spl-token`, using `TOKEN_2022_PROGRAM_ID`. These helpers resolve the extra accounts from the on-chain list, as `tests/transfer-hook-execute.test.ts` does.

## TypeScript Client

The frontend talks to the program through `@coral-xyz/anchor` and the vendored IDL. The helpers live in `frontend/src/lib/solana/`:

- **`pda.ts`:**
  - `deriveProjectState(mint)`
  - `deriveRevenueVault(mint)`
  - `deriveWhitelistEntry(wallet)`
  - `deriveRevenuePeriod(mint, index)`
  - `deriveClaimRecord(periodPda, wallet)`
  - `deriveTelemetryRecord(mint, date)`
- **`readers.ts`:**
  - `fetchAllProjects(connection)`, which uses `program.account.projectState.all()` plus Token-2022 metadata
  - `fetchProjectState`
  - `fetchWhitelistEntry`
  - `fetchInvestorHolding`
  - `fetchAllRevenuePeriods`
  - `fetchClaimRecord`
- **`instructions.ts`** builds a `TransactionInstruction` for each of these:
  - `buy_tokens` and `claim_revenue`
  - `deposit_revenue`
  - `pause_project`, `resume_project` and `close_project`
  - `update_price`
  - `add_to_whitelist` and `remove_from_whitelist`

Minimal example, a whitelisted wallet buying shares. `wallet` comes from `useAnchorWallet()` in `@solana/wallet-adapter-react`:

```ts
import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import type { AnchorWallet } from '@solana/wallet-adapter-react';
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import type { Axel } from '@/lib/solana/idl/axel';
import IDL from '@/lib/solana/idl/axel.json';

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

export async function buyShares(wallet: AnchorWallet, mint: PublicKey, shares: number): Promise<string> {
  const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
  const program = new Program(IDL as Axel, provider);

  const [projectState] = PublicKey.findProgramAddressSync(
    [Buffer.from('project'), mint.toBuffer()],
    program.programId,
  );
  const [whitelistEntry] = PublicKey.findProgramAddressSync(
    [Buffer.from('whitelist'), wallet.publicKey.toBuffer()],
    program.programId,
  );
  const project = await program.account.projectState.fetch(projectState);

  return program.methods
    .buyTokens(new BN(shares))
    .accountsPartial({
      investor: wallet.publicKey,
      admin: project.admin,
      projectState,
      mint,
      investorTokenAccount: getAssociatedTokenAddressSync(mint, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID),
      whitelistEntry,
      tokenExtensionsProgram: TOKEN_2022_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();
}
```

## Codama SDK (`sdk/axel-v2`)

The Codama client covers the v2 program only. `npm run generate` runs `scripts/generate-clients.ts`, which reads `target/idl/axel_v2.json` and renders a `@solana/kit` client into `sdk/axel-v2/src/generated`. See [v2.md](v2.md#idl-and-typescript-client). The stale v1 output that used to live in `sdk/generated` was removed; v1 clients use the vendored IDL in `frontend/src/lib/solana/idl/` with Anchor.
