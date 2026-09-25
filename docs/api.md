# API Reference

AXEL exposes two interfaces:

1. **A small HTTP backend** with three endpoints, in `backend/`.
2. **The `axel` and `transfer_hook` Solana programs.** Clients call them directly.

All business actions (buy, deposit, claim, whitelist, pause and so on) are Solana transactions. The backend is not in that path.

## Backend HTTP Endpoints

- Stack: NestJS 11 (`backend/src`).
- Default port: `3000` (`PORT`).
- No authentication, no CORS configuration, no database.

### Health Check

```
GET /health
```

Checks that the RPC answers (`getSlot`) and reports whether the oracle keypair loaded.

**Response `200`:**
```json
{ "status": "ok", "rpc": "connected", "oracle": "loaded" }
```
`oracle` is `"not_configured"` when `ORACLE_KEYPAIR_PATH` is unset or failed to load.

**Response `503`** (RPC unreachable):
```json
{ "status": "error", "rpc": "disconnected", "oracle": "not_configured" }
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
  solanaTxSignature: string | null; // record_telemetry signature, null if not submitted
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

### KYC Webhook (Sumsub)

```
POST /kyc/webhook
x-payload-digest: <hex HMAC-SHA256 of the raw request body, key = SUMSUB_WEBHOOK_SECRET>
```

**Request body.** The backend reads these fields:
```ts
interface SumsubWebhookPayload {
  type: string;                                   // acted on only when "applicantReviewed"
  applicantId: string;
  externalUserId: string;                         // must be the investor's Solana wallet (base58)
  reviewResult?: { reviewAnswer: 'GREEN' | 'RED' };
  reviewStatus?: string;
}
```

**What happens:**
1. **Signature check.** The backend verifies the digest. If `SUMSUB_WEBHOOK_SECRET` is empty, it logs a warning and **skips the check**.
2. **Filter.** Only `applicantReviewed` with `reviewAnswer == "GREEN"` proceeds.
3. **Whitelist transaction.** `externalUserId` is parsed as a public key. The backend then signs `add_to_whitelist(wallet)` with the keypair at `ADMIN_KEYPAIR_PATH`. It sends and confirms the transaction, retrying once.

**Response `200`:**
```json
{ "status": "ok", "solanaTxSignature": "<signature>" }
```

`solanaTxSignature` is `null` in any of these cases:
- the event was ignored
- the answer was not `GREEN`
- the wallet is invalid
- the admin keypair is not loaded
- both transaction attempts failed

**Response `401`:** the signature did not match (NestJS `UnauthorizedException`, message `"Invalid signature"`).

### Backend Configuration

| Variable | Used by | Default / behaviour when unset |
|---|---|---|
| `SOLANA_RPC_URL` | `SolanaService` | `http://127.0.0.1:8899` |
| `PORT` | `main.ts` | `3000` |
| `PROJECT_MINT` | telemetry cron | Cron skips ingestion |
| `VEHICLE_LICENSE_PLATE` | telemetry cron | Cron skips ingestion |
| `ORACLE_KEYPAIR_PATH` | telemetry cron | Data is cached but not submitted on-chain |
| `YANDEX_PARK_ID`, `YANDEX_CLIENT_ID`, `YANDEX_API_KEY` | `YandexFleetService` | Simulated telemetry |
| `CRON_SCHEDULE` | `@Cron` decorator (read from `process.env` when the module loads) | `0 1 * * *` (daily 01:00) |
| `SUMSUB_WEBHOOK_SECRET` | `KycService` | Signature verification skipped |
| `ADMIN_KEYPAIR_PATH` | `KycService` | Webhook cannot whitelist on-chain |

The `axel` program ID is hardcoded in `kyc.service.ts` and `telemetry-cron.service.ts`.

## Frontend Environment

`frontend/.env.local.example` lists these variables:

| Variable | Read in | Notes |
|---|---|---|
| `NEXT_PUBLIC_SOLANA_RPC_URL` | `lib/solana/connection.ts`, `providers/WalletProvider.tsx` | Defaults to devnet |
| `NEXT_PUBLIC_SOLANA_NETWORK` | `lib/solana/connection.ts` | Used for Explorer links; default `devnet` |
| `NEXT_PUBLIC_PROGRAM_ID` | `lib/solana/connection.ts` | Defaults to `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M` |
| `NEXT_PUBLIC_TELEMETRY_API_URL` | `lib/api/telemetry.ts` | That client is not used by any component |
| `NEXT_PUBLIC_KYC_URL` | — | Not read anywhere |

The dashboard telemetry widget (`hooks/useTelemetry.ts`) reads `NEXT_PUBLIC_API_URL`, which is not in the example file.

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
