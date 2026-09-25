# API Reference

AXEL exposes two interfaces:

1. **A small HTTP backend** in `backend/`: health, published telemetry, revenue reports and deposit attestation, and KYC.
2. **The `axel` and `transfer_hook` Solana programs.** Clients call them directly.

All business actions (buy, deposit, claim, whitelist, pause and so on) are Solana transactions. The backend signs three kinds of v2 transactions: `set_investor` after a Sumsub review (KYC key), `record_telemetry` batches (oracle key), and its co-signature on an operator's `deposit_revenue` (oracle key).

## Backend HTTP Endpoints

- Stack: NestJS 11 (`backend/src`), SQLite through `better-sqlite3` for KYC state, published telemetry and attested reports.
- Default port: `3000` (`PORT`).
- CORS: only the origins in `CORS_ORIGINS`, methods `GET` and `POST`.
- Errors use the NestJS shape: `{ "statusCode": 400, "message": "...", "error": "Bad Request" }`.
- Run a single instance: the per-wallet ordering of webhook events and the rate limits live in the process.

### Health Check

```
GET /health
```

Checks that the RPC answers (`getSlot`) and whether the KYC flow and the oracle are configured.

**Response `200`:**
```json
{ "status": "ok", "rpc": "connected", "kyc": "ready", "oracle": "ready" }
```
- `kyc` is `"not_configured"` unless `SUMSUB_WEBHOOK_SECRET`, `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` and the KYC authority keypair are all set.
- `oracle` is `"not_configured"` without `ORACLE_KEYPAIR_PATH`.

**Response `503`** (RPC unreachable):
```json
{ "status": "error", "rpc": "disconnected", "kyc": "ready", "oracle": "ready" }
```

### Telemetry: what is published

Every car in `FLEET_CONFIG` gets one record per calendar day of the fleet's zone (`FLEET_UTC_OFFSET`, default `+05:00`). The daily job (`CRON_SCHEDULE`) collects every finished day a car is missing, up to 31 days back, oldest first. A car's first day is its `startDate`, or yesterday. If a day cannot be read, the car stops at that day and the next run starts there again, so no day is skipped.

**Day record** (`axel.telemetry.day/v1`), shown here as its canonical text:

```json
{"currency":"KZT","data_origin":"simulated","date":"2026-09-24","km":143,"mint":"<share mint>","rent_charged":12000,"schema":"axel.telemetry.day/v1","status":"active","trips":17,"utc_offset":"+05:00"}
```

| Field | Meaning |
|---|---|
| `date`, `utc_offset` | The calendar day and the zone it is in |
| `status` | `active`: the car was rented out or drove; `idle`: no rent and no trips; `maintenance`: in repair (only the simulation produces it) |
| `trips`, `km` | Completed orders booked that day and their total distance (km, rounded down) |
| `rent_charged` | Whole KZT the park charged for the car that day, net of corrections; this is the owners' gross income |
| `data_origin` | `yandex_fleet` or `simulated`. It is inside the hashed text, so it is committed on-chain too |

- **Hash.** `data_hash` = SHA-256 of the record's [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JCS) canonical form. That text is what `GET /telemetry/:mint/:date.json` serves, byte for byte, and it never changes after it is collected.
- **On-chain entry.** `record_telemetry` gets `{ date: YYYYMMDD, data_hash, trips, km, rent_paid: rent_charged, status }` with these status codes:

  | Code | Status |
  |---|---|
  | 0 | reserved, never written |
  | 1 | `active` |
  | 2 | `idle` |
  | 3 | `maintenance` |

- **Chain.** `head = sha256(head_before ‖ u32 LE(YYYYMMDD) ‖ data_hash)`, starting from 32 zero bytes. The oracle key appends up to 20 days per transaction. The program stores only the head, the count and the last date in `Project`.
- **Where the figures come from.**
  - `yandex_fleet`:
    - trips and distance come from the park's completed orders (`POST /v1/parks/orders/list`), matched to the car by plate;
    - `rent_charged` is the sum of the transactions in `YANDEX_RENT_CATEGORY_IDS` (`POST /v2/parks/transactions/list`) of the drivers whose current car is this one (`POST /v1/parks/driver-profiles/list`).
    - There is no fallback: when the API fails, nothing is published for that day.
  - `simulated`: a deterministic generator seeded by mint and date:
    - rented out on 85% of days, idle on 10% and in maintenance on 5%;
    - 12–24 trips of 6–12 km on a rented day;
    - `simulatedDailyRent` charged on rented days only.
    - Refused on mainnet.

### Latest Telemetry (asset page widget)

```
GET /telemetry/latest/:mint
```

The newest collected day of a car, in the shape the asset page widget reads.

**Response `200`:**
```ts
interface LatestTelemetryResponse {
  date: string;                     // "YYYY-MM-DD" in the fleet's zone
  dailyRevenue: number;             // rent_charged, KZT
  mileageKm: number;
  tripsCount: number;
  carStatus: 'active' | 'maintenance' | 'inactive' | ''; // "idle" is reported as "inactive"
  dataHash: string;                 // hex SHA-256 of the published text
  solanaTxSignature: string | null; // the record_telemetry transaction, once confirmed
  stale: boolean;                   // true if `date` is neither today nor yesterday in the fleet's zone
  available: boolean;               // false for a car outside the fleet or with no day yet
  dataOrigin: 'yandex_fleet' | 'simulated' | null;
}
```

### Published Day

```
GET /telemetry/:mint/:date.json        e.g. /telemetry/<mint>/2026-09-24.json
```

The day's canonical text, exactly as hashed. `Content-Type: application/json; charset=utf-8`, `Cache-Control: public, max-age=31536000, immutable`. `404` if the car is not in the fleet or the day was not collected; `400` if `date` is not a real day.

### Day Proof

```
GET /telemetry/:mint/proof?date=YYYY-MM-DD
```

**Response `200`:**
```json
{
  "mint": "<share mint>",
  "project": "<project PDA>",
  "date": "2026-09-24",
  "dataOrigin": "simulated",
  "raw": "<the canonical text>",
  "record": { "...": "the same, parsed" },
  "rawUrl": "/telemetry/<mint>/2026-09-24.json",
  "dataHash": "<hex>",
  "chain": {
    "position": 25,
    "headBefore": "<hex>",
    "headAfter": "<hex>",
    "txSignature": "<record_telemetry signature>",
    "confirmedAt": "2026-09-25T06:00:03.000Z"
  },
  "headFormula": "sha256(headBefore || u32le(YYYYMMDD) || dataHash)"
}
```
- `position` equals `Project.telemetry_count` right after this day was appended.
- `chain` is `null` until the day's batch is confirmed, and stays `null` for a day the chain can no longer take (see below).

### Chain Entries

```
GET /telemetry/:mint/chain?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Confirmed days between `from` and `to` (both optional), in chain order, at most 366. The response has `entries: [{ date, dataHash, dataOrigin, position, headAfter, txSignature }]` and `truncated`. Recomputing the formula over the entries from the first entry's `headBefore` (see its proof) must give the last `headAfter`, and the last entry of the chain must match `Project.telemetry_head`.

**How the backend keeps the chain.**
- **Before sending.** A signed batch, with the positions and heads it will produce, is stored first. After a crash the next run can tell whether the batch landed:
  - the head matches → the batch is marked confirmed;
  - the chain is unchanged and the blockhash expired → the days are sent again;
  - the chain is unchanged and the blockhash is still valid → it waits.
- **Another writer.** If the chain holds a head this backend did not write, it stops writing for that car (`diverged`, logged).
- **A chain started elsewhere.** With nothing confirmed locally, the backend continues from the head the chain has, for example one the seed script wrote. Collected days that are not later than the chain's last date stay published but off-chain.
- **When it writes.** Only while the project is `Operating` or `Paused` and the project's oracle is this backend's key.

### Revenue Report: Draft

```
POST /reports/draft
Content-Type: application/json
```

Builds the report the oracle would attest, from the operator's stated expenses and the car's published, on-chain telemetry. Nothing is stored. Limit: 10 requests a minute per client IP.

**Request:**
```json
{
  "mint": "<share mint>",
  "kind": "regular",
  "period": { "start": "2026-09-01", "end": "2026-09-30" },
  "expenses": {
    "maintenance": [{ "description": "Oil and filters", "amount": 18000, "document_sha256": "<hex or null>" }],
    "insurance": [{ "description": "OGPO and KASKO, September", "amount": 30000 }]
  },
  "car_sale": null
}
```
- `kind` is `regular` (rent) or `final` (the car is sold; `car_sale: { proceeds, document_sha256 }` is then required).
- The period covers 1–31 days, and every day of it must be published and confirmed on-chain.
- Amounts are whole KZT, from 1 to 10¹². There are at most 50 items per list. `document_sha256` is the hash of the invoice or policy.

**Response `200`:**
```json
{
  "report": { "...": "see below" },
  "reportHash": "<hex SHA-256 of the report's canonical text>",
  "dataOrigin": "simulated",
  "depositParams": { "gross": "260500000000", "periodStart": 20260901, "periodEnd": 20260930, "reportHash": "<hex>", "kind": "regular" }
}
```
`depositParams` are the `deposit_revenue` arguments that commit to this report.

**Report** (`axel.revenue-report/v1`):

| Field | Value |
|---|---|
| `mint`, `project`, `kind`, `period` (`start`, `end`, `days`), `currency: "KZT"` | |
| `data_origin` | `yandex_fleet`, `simulated`, or `mixed` when the period has both |
| `income` | `rent` (Σ `rent_charged`), `days_active`, `trips`, `km` |
| `expenses.park_fee` | `{ bps: parkFeeBps, amount: floor(rent × bps / 10 000) }` |
| `expenses.maintenance`, `expenses.insurance` | the operator's items |
| `car_sale` | `null`, or the sale in a final report |
| `totals` | `maintenance`, `insurance`, `distributable = rent − park fee − maintenance − insurance (+ sale proceeds)` |
| `deposit` | `payment_mint`, its `decimals`, `gross = distributable × 10^decimals` as a decimal string (`"0"` if nothing is left) |
| `telemetry` | `first_position`, `last_position`, `head_before`, `head_after`, and `days: [{ date, data_hash }]` for every day |

The platform fee (`Project.revenue_fee_bps`) is taken on-chain from `gross`. Report amounts are in KZT, and `gross` assumes the project's payment mint is a KZT stablecoin (tKZT, KZTE).

| Status | When |
|---|---|
| `400` | the input is not valid (the message names the field) |
| `404` | the car is not in `FLEET_CONFIG`, or its project does not exist |
| `409` | `missingDays`: days of the period not published and confirmed yet; or the car's telemetry chain diverged |
| `422` | `gross` would not fit a u64 |

### Revenue Report: Attest a Deposit

```
POST /reports/attest
Content-Type: application/json

{ "report": <the report from /reports/draft>, "transaction": "<base64 serialized transaction>" }
```

The operator's wallet builds `deposit_revenue` with `depositParams`, signs it, and sends it here. The backend runs these checks, then adds the oracle's signature. The caller sends the returned transaction.

1. **Transaction.** At most 1,232 bytes and no address lookup tables. Only ComputeBudget instructions and exactly one `deposit_revenue`, whose `oracle` is this backend's key. The oracle is not the fee payer and its account is read-only. Every other required signature, the operator's included, is present and valid.
2. **Report.** The backend rebuilds it from the stated expenses and the published days. Any difference is refused with the JSON paths that differ.
3. **Project.** The deposit is for the report's project. The project is `Operating`, its oracle is this backend's key, and the signer in the `operator` slot is `Project.operator`.
4. **Arguments.** `gross`, `period_start`, `period_end`, `report_hash` and `kind` equal the report's, and the distributable amount is positive.
5. **Overlaps.** No `RevenuePeriod` on-chain overlaps the period, and no final (car sale) deposit exists. No earlier attested deposit for an overlapping period has landed or can still land (its blockhash is still valid). Attestations for one car run one at a time.

**Response `200`:**
```json
{ "reportHash": "<hex>", "dataOrigin": "simulated", "transaction": "<base64, fully signed>", "signature": "<transaction ID>" }
```
The report is stored and published at `/reports/:mint/:reportHash.json`. Sending the same transaction again returns the same answer.

| Status | When |
|---|---|
| `400` | not `{ report, transaction }`, not a transaction, lookup tables, or invalid report input |
| `401` | a signature other than the oracle's is missing or invalid |
| `404` | the car or its project is unknown |
| `409` | the project is not `Operating`, or its oracle is another key; the period overlaps a deposit; days are missing; the chain diverged |
| `422` | the report differs from the rebuilt one (`differences`), other instructions, the oracle pays or is writable, another oracle or operator, arguments differ, nothing to distribute |
| `503` | `ORACLE_KEYPAIR_PATH` is not set |

### Attested Reports

```
GET /reports/:mint
GET /reports/:mint/:reportHash.json
```

The first lists the reports the oracle attested for the car, oldest period first:

```json
{ "mint": "<share mint>", "reports": [{ "reportHash": "<hex>", "kind": "regular", "periodStart": "2026-09-01", "periodEnd": "2026-09-30", "gross": "260500000000", "dataOrigin": "simulated", "url": "/reports/<mint>/<hash>.json", "attestations": [{ "depositSignature": "<signature>", "attestedAt": "<ISO time>" }] }] }
```
The second serves a report's canonical text byte for byte. Its SHA-256 is the `report_hash` of the deposit's `RevenuePeriod`.

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

`backend/.env.example` lists every variable. The values are validated at startup; an invalid value stops the process. With `NODE_ENV=production` the backend refuses to start without `AXEL_PROGRAM_ID`, `CORS_ORIGINS`, `SIWS_URI`, `KYC_AUTHORITY_KEYPAIR_PATH`, `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY`, `SUMSUB_WEBHOOK_SECRET` and `SUMSUB_LEVEL_NAME`, and it requires https origins. It also needs `ORACLE_KEYPAIR_PATH` when `FLEET_CONFIG` lists a car.

| Variable | Used by | Default / behaviour when unset |
|---|---|---|
| `PORT` | `main.ts` | `3000` |
| `CORS_ORIGINS` | CORS | `http://localhost:3000` |
| `TRUST_PROXY` | client IP for rate limits | `0` |
| `SOLANA_RPC_URL` | `SolanaService` | `http://127.0.0.1:8899` |
| `SOLANA_CLUSTER` | sign-in message | `devnet` |
| `AXEL_PROGRAM_ID` | v2 program client | `address` of `src/solana/idl/axel_v2.json` |
| `DATABASE_PATH` | SQLite file (KYC state, published days, attested reports) | `data/axel-backend.sqlite` |
| `KYC_AUTHORITY_KEYPAIR_PATH` | `set_investor` signer | webhook answers `503`; an unreadable file stops the start |
| `SIWS_URI` | sign-in message domain and URI | `http://localhost:3000` |
| `SUMSUB_BASE_URL` | Sumsub API | `https://api.sumsub.com` |
| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` | Sumsub API | `/kyc/session` answers `503` |
| `SUMSUB_LEVEL_NAME` | WebSDK level, approval check | `basic-kyc-level` |
| `SUMSUB_WEBHOOK_SECRET` | webhook HMAC | webhook answers `503` |
| `FLEET_CONFIG` | cars: `{ "<share mint>": { plate, source, parkFeeBps, simulatedDailyRent?, startDate? } }` | `{}`; a `yandex_fleet` car without Yandex credentials, or a simulated car on mainnet, stops the start |
| `FLEET_UTC_OFFSET` | where a reported day starts | `+05:00` |
| `ORACLE_KEYPAIR_PATH` | `record_telemetry` signer and fee payer; deposit co-signer | days are published but not written on-chain; `/reports/attest` answers `503`; required in production when there are cars |
| `YANDEX_PARK_ID`, `YANDEX_CLIENT_ID`, `YANDEX_API_KEY` | `YandexFleetClient` | required for `yandex_fleet` cars; set all three or none |
| `YANDEX_RENT_CATEGORY_IDS` | which park transactions are rent | `partner_service_recurring_payment` |
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
