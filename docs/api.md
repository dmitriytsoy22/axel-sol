# API Reference

AXEL exposes these interfaces:

1. **A small HTTP backend** in `backend/`: health, published telemetry, revenue reports and the operator's deposit flow, each car's data in the layout "Verify" reads, KYC, the history of v2 program events and each wallet's payouts.
2. **The Solana program `axel_v2`** ([reference](#program-reference-axel_v2), design in [v2.md](v2.md)). Clients call it directly. It is not deployed yet. The v1 `axel` and `transfer_hook` programs, which run on devnet since before the hackathon, are documented at the end as [legacy](#legacy-program-reference-axel-v1).
3. **The TypeScript clients:** the frontend's Anchor-based client and the generated Codama SDK ([below](#typescript-client-frontend-axel_v2)).
4. **The indexer API** that the frontend reads payout history from when one is configured ([below](#indexer-api-read-by-the-frontend)). The backend serves it from its index of every v2 event ([below](#program-events-what-is-indexed)).
5. **The judge demo routes and Solana Actions (Blinks)** of the frontend, in `frontend/src/app/api/`: [demo access, shares and simulated months](#judge-demo-api) on devnet, and [invest and claim Blinks](#solana-actions-blinks).

All business actions (buy, deposit, claim, KYC, pause and so on) are Solana transactions. The backend signs three kinds of v2 transactions: `set_investor` after a Sumsub review (KYC key), `record_telemetry` batches (oracle key), and its co-signature on an operator's `deposit_revenue` (oracle key), either on a deposit the operator signed first or on one it builds for the operator to sign.

## Backend HTTP Endpoints

- Stack: NestJS 11 (`backend/src`), SQLite through `better-sqlite3` for KYC state, published telemetry, attested reports and indexed program events.
- Default port: `3000` (`PORT`).
- CORS: only the origins in `CORS_ORIGINS`, methods `GET` and `POST`.
- Errors use the NestJS shape: `{ "statusCode": 400, "message": "...", "error": "Bad Request" }`.
- Run a single instance: the per-wallet ordering of webhook events and the rate limits live in the process.
- **Data origin.** Every telemetry and report response says where its figures come from: `dataOrigin` in the JSON responses, `data_origin` inside the published records, reports and car files. It is `yandex_fleet`, `simulated`, `mixed` when a set holds both, or `null` when a response lists nothing.

### Health Check

```
GET /health
```

Checks that the RPC answers (`getSlot`), whether the KYC flow and the oracle are configured, and how the event indexer is doing.

**Response `200`:**
```json
{ "status": "ok", "rpc": "connected", "kyc": "ready", "oracle": "ready", "indexer": "live" }
```
- `kyc` is `"not_configured"` unless `SUMSUB_WEBHOOK_SECRET`, `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` and the KYC authority keypair are all set.
- `oracle` is `"not_configured"` without `ORACLE_KEYPAIR_PATH`.
- `indexer`:

  | Value | Meaning |
  |---|---|
  | `starting` | no sync has finished since the start |
  | `live` | the last sync finished |
  | `retrying` | the last sync failed on the RPC; the next one waits for the backoff delay |
  | `halted` | the database was filled from another cluster or program (see [Program Events](#program-events-what-is-indexed)); nothing is indexed |
  | `disabled` | `INDEXER_ENABLED=false` |

  The indexer never makes the health check fail; only the RPC does.

**Response `503`** (RPC unreachable):
```json
{ "status": "error", "rpc": "disconnected", "kyc": "ready", "oracle": "ready", "indexer": "retrying" }
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

- **Hash.** `data_hash` = SHA-256 of the record's [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785) (JCS) canonical form. That text is the `raw` of the [day's proof](#day-proof), and it never changes after it is collected. Confirmed days are also in the car's [published data](#published-car-data-read-by-verify), where re-canonicalizing each record gives the same text.
- **On-chain entry.** `record_telemetry` gets `{ date: YYYYMMDD, data_hash, trips, km, rent_paid: rent_charged, status }` with these status codes:

  | Code | Status |
  |---|---|
  | 0 | reserved, never written |
  | 1 | `active` |
  | 2 | `idle` |
  | 3 | `maintenance` |
  | 4 | `repair`: off the road after an accident. Only the demo seed writes it |

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
- `404` if the car is not in the fleet or the day was not collected; `400` if `date` is not a real day.

### Chain Entries

```
GET /telemetry/:mint/chain?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Confirmed days between `from` and `to` (both optional), in chain order, at most 366. The response has `dataOrigin` (of the listed entries), `entries: [{ date, dataHash, dataOrigin, position, headAfter, txSignature }]` and `truncated`. Recomputing the formula over the entries from the first entry's `headBefore` (see its proof) must give the last `headAfter`, and the last entry of the chain must match `Project.telemetry_head`.

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
5. **Overlaps.** No `RevenuePeriod` on-chain overlaps the period, and no final (car sale) deposit exists. No earlier attested deposit for an overlapping period has landed or can still land (its blockhash is still valid). A [deposit draft](#deposit-draft-operator-flow) for an overlapping period that can still land stands in the way only of a deposit built for another period index, since of two deposits for the same index at most one lands. Attestations and drafts for one car run one at a time.

**Response `200`:**
```json
{ "reportHash": "<hex>", "dataOrigin": "simulated", "transaction": "<base64, fully signed>", "signature": "<transaction ID>" }
```
The report is stored and published at `/published/:mint/reports/:reportHash.json`, and the car's [published index](#published-car-data-read-by-verify) lists it once the deposit is indexed. Sending the same transaction again returns the same answer.

| Status | When |
|---|---|
| `400` | not `{ report, transaction }`, not a transaction, lookup tables, or invalid report input |
| `401` | a signature other than the oracle's is missing or invalid |
| `404` | the car or its project is unknown |
| `409` | the project is not `Operating`, or its oracle is another key; the period overlaps a deposit; days are missing; the chain diverged |
| `422` | the report differs from the rebuilt one (`differences`), other instructions, the oracle pays or is writable, another oracle or operator, arguments differ, nothing to distribute |
| `503` | `ORACLE_KEYPAIR_PATH` is not set |

### Deposit Draft (operator flow)

```
POST /v2/deposits/draft
Content-Type: application/json
```

The operator's way to deposit a month's revenue with one wallet signature. The operator sends its monthly report; the backend checks it against the published telemetry, builds the `deposit_revenue` that pays it out, and co-signs it as the oracle. The operator's wallet signs the returned transaction and sends it. Limit: 10 requests a minute per client IP.

**Request:** the monthly report as JSON. It holds at least the operator's part, as for [`/reports/draft`](#revenue-report-draft) (`mint`, `kind`, `period`, `expenses`, `car_sale`). It may also state any other field of the [report](#revenue-report-draft), such as `income` or `totals`, or be a whole report from an earlier draft. Every field it states must equal the one the backend rebuilds from the published days; a field the report does not have is refused too.

**Response `200`:**
```json
{
  "reportHash": "<hex SHA-256 of the report's canonical text>",
  "dataOrigin": "simulated",
  "report": { "...": "the rebuilt report" },
  "depositParams": { "gross": "260500000000", "periodStart": 20260901, "periodEnd": 20260930, "reportHash": "<hex>", "kind": "regular" },
  "periodIndex": 3,
  "operator": "<Project.operator>",
  "transaction": "<base64 v0 transaction, signed by the oracle only>",
  "lastValidBlockHeight": 312045677
}
```
- **The transaction** holds one instruction, `deposit_revenue` with `depositParams`, for the `RevenuePeriod` at `periodIndex` (`Project.period_count` when it was built). Its fee payer is the operator, who pays from its canonical (associated) payment account; the treasury's account is the treasury's associated account. The oracle's account is read-only. The operator's signature slot is empty. Any change to the message voids the oracle's signature.
- **It lands only as `periodIndex`**, until `lastValidBlockHeight`. The program creates each period at `Project.period_count`, so once another deposit takes that index the draft can no longer land. Drafting the same period again while an earlier draft can still land is therefore allowed: at most one of them lands.
- **The report** is stored and published at `/published/:mint/reports/:reportHash.json` right away. The car's published index lists it once its deposit is indexed.
- **Checks** are those of [`/reports/attest`](#revenue-report-attest-a-deposit) that do not need the operator's transaction: the report is rebuilt from the published days, the project is `Operating` and its oracle is this backend's key, something is left to distribute, no deposit on-chain overlaps the period, and the car's sale has not been paid out. An operator-signed deposit for an overlapping period that has landed or can still land is refused too.

| Status | When |
|---|---|
| `400` | the report's operator part is not valid (the message names the field) |
| `404` | the car is not in `FLEET_CONFIG`, or its project does not exist |
| `409` | the project is not `Operating`, or its oracle is another key; the period overlaps a deposit on-chain or an attested one that can still land; days are missing; the chain diverged |
| `422` | a stated field differs from the rebuilt report (`differences`, as JSON paths); nothing to distribute; `gross` would not fit a u64 |
| `503` | `ORACLE_KEYPAIR_PATH` is not set |

### Attested Reports

```
GET /reports/:mint
```

The reports the oracle attested or drafted a deposit for, oldest period first:

```json
{ "mint": "<share mint>", "dataOrigin": "simulated", "reports": [{ "reportHash": "<hex>", "kind": "regular", "periodStart": "2026-09-01", "periodEnd": "2026-09-30", "gross": "260500000000", "dataOrigin": "simulated", "url": "/published/<mint>/reports/<hash>.json", "attestations": [{ "depositSignature": "<signature>", "attestedAt": "<ISO time>" }], "drafts": [{ "periodIndex": 3, "draftedAt": "<ISO time>" }] }] }
```
`url` serves the report's canonical text byte for byte ([Published Car Data](#published-car-data-read-by-verify)). Its SHA-256 is the `report_hash` of the deposit's `RevenuePeriod`. A listed report did not necessarily land: the car's published index lists only those whose deposit did.

### Published Car Data

```
GET /published/:mint/index.json
GET /published/:mint/telemetry/:month.json          e.g. /published/<mint>/telemetry/2026-09.json
GET /published/:mint/reports/:reportHash.json
```

Each fleet car's data in the layout the app's "Check the car's data yourself" reads and the demo seed writes, described [below](#published-car-data-read-by-verify). Point `NEXT_PUBLIC_PUBLISHED_DATA_URL` at `<backend>/published` to verify the backend's cars.

- The index and the month files grow as days are confirmed and deposits land: `Cache-Control: no-cache`. A report's text never changes: `public, max-age=31536000, immutable`.
- `404` for a car outside the fleet, a month without published days, or a report this backend did not attest; `400` for a month that is not `YYYY-MM`.

### Program Events: what is indexed

The backend keeps the history of every event `axel_v2` emits (the 23 events in the IDL, such as `ProjectCreated`, `SharesPurchased`, `RevenueDeposited`, `Claimed`, `SharesTransferred` and `TelemetryRecorded`) in SQLite. The accounts stay the source of truth for balances and states. The history is an index built from the chain, and it can be rebuilt by deleting the tables.

How it is kept complete:
- **History first.** `getSignaturesForAddress(program)` pages back to the last stored signature, and every newer transaction is stored oldest first. A transaction and its events are written in one SQLite transaction together with the cursor. After a crash or an RPC error, the next sync resumes after the last stored transaction, so nothing is lost or stored twice.
- **Live logs.** A `logsSubscribe` websocket (`mentions: [program]`, `confirmed`) starts a sync as soon as a transaction lands. Its logs are used directly, without a second `getTransaction`. If the history does not list a notified transaction yet, the sync is retried after 1 s, 2 s, 4 s and so on, for up to two minutes.
- **Missed notifications.** A dropped websocket is reopened with backoff and pinged every 30 s. Each resubscription starts a sync, and a poll (`INDEXER_POLL_INTERVAL_MS`, default 30 s) catches anything else.
- **RPC failures.** A failed sync is retried after 1 s, doubling up to 60 s. While it waits, new notifications do not call the RPC.
- **Only confirmed, successful transactions count.** Failed transactions are recorded without events, even though their logs contain events the runtime reverted.
- **Events from CPIs count.** `SharesTransferred` is emitted by the transfer hook while Token-2022 runs it. The log parser follows the invoke stack, so these events are kept, and records written by other programs are ignored.
- **Idempotent.** Each event is stored once, keyed by transaction signature and its index among the program's events in that transaction.
- **One chain per database.** On the first sync the database records the cluster's genesis hash and the program ID. If either differs later, the indexer halts instead of mixing two histories (`/health` shows `halted`). Use a new `DATABASE_PATH` after resetting a local validator.
- **Unknown records.** A record that does not decode with the vendored IDL is stored with type `Unknown` and no `data`, and its raw bytes are kept.

Every endpoint below lists events **newest first** and pages the same way: `limit` (1–200, default 50) and `before=<id>`. The response's `nextBefore` is the `before` for the next, older page, or `null` on the last page.

An event looks like this:
```json
{
  "id": 42,
  "signature": "<transaction signature>",
  "index": 0,
  "slot": 3120551,
  "blockTime": "2026-10-01T07:12:09.000Z",
  "type": "RevenueDeposited",
  "project": "<project account>",
  "data": {
    "project": "<project account>",
    "index": 0,
    "periodStart": 20260901,
    "periodEnd": 20260930,
    "gross": "1000000000",
    "fee": "150000000",
    "net": "850000000",
    "supply": "10",
    "accAfter": "1567973246265311887360000000",
    "reportHash": "a0a1a2…bebf",
    "attestor": "<oracle>",
    "kind": "regular"
  }
}
```
- `id` grows in chain order. `index` is the event's position among the program's events in its transaction.
- `project` is the project account (the PDA `["project", share mint]`). It is `null` for events without one: `ConfigUpdated`, `AdminProposed`, `AdminChanged`, `InvestorUpdated`, `Unknown`.
- `blockTime` is `null` when the RPC does not know it.
- `data` has the event's fields in camelCase: public keys in base58, byte arrays in hex, `u64`, `i64` and `u128` as decimal strings, smaller integers as numbers, and enums as the variant name (`"funded"`, `"final"`). Amounts are base units of the payment mint.

### Events

```
GET /events?project=<project account>&type=<Type[,Type…]>&before=<id>&limit=<n>
```

Every indexed event. All parameters are optional:
- `project` filters by project account;
- `type` takes one event type or several separated by commas, as the program names them (`SharesPurchased,Claimed`), or `Unknown`.

**Response `200`:** `{ "events": [ … ], "nextBefore": 17 }`

**Response `400`:** `project` is not a base58 public key, an unknown `type`, or `before` / `limit` out of range.

### Project History

```
GET /projects/:mint/history?type=<Type[,Type…]>&before=<id>&limit=<n>
```

The events of the project with this share mint, from `ProjectCreated` on.

**Response `200`:**
```json
{ "mint": "<share mint>", "project": "<project account>", "events": [ … ], "nextBefore": null }
```

**Response `400`:** `mint` is not a base58 public key, or a query parameter is invalid. **`404`:** no `ProjectCreated` is indexed for this mint.

### Claims of an Owner

```
GET /positions/:owner/claims?project=<project account>&before=<id>&limit=<n>
```

The owner's `Claimed` events across all projects, or in one project with `project`. `claimer` differs from the owner when someone else triggered the payout; the money always goes to the owner.

**Response `200`:**
```json
{
  "owner": "<wallet>",
  "claims": [
    { "id": 14, "signature": "<signature>", "slot": 3120560, "blockTime": "2026-10-01T07:12:30.000Z", "project": "<project account>", "claimer": "<wallet>", "amount": "510000000" }
  ],
  "nextBefore": null,
  "totals": [{ "project": "<project account>", "amount": "510000000", "claims": 1 }]
}
```
`totals` add up every claim of the owner (within `project`, if given), not only the page, and are exact for any `u64`. A wallet that never claimed gets empty `claims` and `totals`.

**Response `400`:** `owner` or `project` is not a base58 public key, or `before` / `limit` is out of range.

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
| `SOLANA_RPC_URL` | `SolanaService`; the indexer unless `INDEXER_RPC_URL` is set | `http://127.0.0.1:8899`; must start with `http://` or `https://` |
| `SOLANA_CLUSTER` | sign-in message | `devnet` |
| `AXEL_PROGRAM_ID` | v2 program client | `address` of `src/solana/idl/axel_v2.json` |
| `DATABASE_PATH` | SQLite file (KYC state, published days, attested reports, indexed events) | `data/axel-backend.sqlite` |
| `KYC_AUTHORITY_KEYPAIR_PATH` | `set_investor` signer | webhook answers `503`; an unreadable file stops the start |
| `SIWS_URI` | sign-in message domain and URI | `http://localhost:3000` |
| `SUMSUB_BASE_URL` | Sumsub API | `https://api.sumsub.com` |
| `SUMSUB_APP_TOKEN`, `SUMSUB_SECRET_KEY` | Sumsub API | `/kyc/session` answers `503` |
| `SUMSUB_LEVEL_NAME` | WebSDK level, approval check | `basic-kyc-level` |
| `SUMSUB_WEBHOOK_SECRET` | webhook HMAC | webhook answers `503` |
| `FLEET_CONFIG` | cars: `{ "<share mint>": { plate, source, parkFeeBps, simulatedDailyRent?, startDate? } }` | `{}`; a `yandex_fleet` car without Yandex credentials, or a simulated car on mainnet, stops the start |
| `FLEET_UTC_OFFSET` | where a reported day starts | `+05:00` |
| `ORACLE_KEYPAIR_PATH` | `record_telemetry` signer and fee payer; deposit co-signer | days are collected but not written on-chain; `/reports/attest` and `/v2/deposits/draft` answer `503`; required in production when there are cars |
| `YANDEX_PARK_ID`, `YANDEX_CLIENT_ID`, `YANDEX_API_KEY` | `YandexFleetClient` | required for `yandex_fleet` cars; set all three or none |
| `YANDEX_RENT_CATEGORY_IDS` | which park transactions are rent | `partner_service_recurring_payment` |
| `CRON_SCHEDULE` | telemetry job, registered after `.env` is loaded | `0 1 * * *` (daily 01:00, server time) |
| `INDEXER_ENABLED` | event indexer | `true`; `false` leaves the RPC alone, and the event endpoints serve what is stored |
| `INDEXER_RPC_URL` | history reads (`getSignaturesForAddress`, `getTransaction`) | `SOLANA_RPC_URL` |
| `INDEXER_WS_URL` | `logsSubscribe` | the indexer RPC as `ws://` or `wss://`, on the next port if it has one (`http://127.0.0.1:8899` → `ws://127.0.0.1:8900/`); a query string such as an API key is kept |
| `INDEXER_POLL_INTERVAL_MS` | how often the indexer checks for transactions the subscription missed | `30000` (1000–3600000) |

The v2 program ID comes from `AXEL_PROGRAM_ID` or the vendored IDL; instructions are built with `@coral-xyz/anchor` from that IDL. `npm run export-idl` in the repository root refreshes the backend copy together with the frontend one.

## Frontend Environment

`frontend/.env.local.example` lists these variables, all read at build time:

| Variable | Read in | Default and notes |
|---|---|---|
| `NEXT_PUBLIC_SOLANA_NETWORK` | `lib/solana/connection.ts`, `app/opengraph-image.tsx` | `devnet`. One of `devnet`, `testnet`, `mainnet-beta`, `localnet`; any other value fails the build. Explorer links follow it; `localnet` opens Explorer on the local RPC. |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | `lib/solana/connection.ts`, `providers/WalletProvider.tsx`, `next.config.mjs` | The cluster's public RPC (`http://127.0.0.1:8899` for `localnet`). Its origin and websocket are added to the CSP. |
| `NEXT_PUBLIC_PROGRAM_ID` | `lib/solana/connection.ts` | The `address` in `idl-v2/axel_v2.json` (`AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi`). |
| `NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS` | `lib/solana/tokens.ts` | Unset. `<mint>:<symbol>,<mint>:<symbol>` names payment mints without on-chain metadata. A Token-2022 mint's own metadata symbol wins, Circle's USDC is known by address, anything else shows its short address. |
| `NEXT_PUBLIC_TELEMETRY_API_URL` | `lib/api/telemetry.ts`, `next.config.mjs` | Unset: the car page says trip data is not connected and makes no request. Set: the backend's base URL; the widget asks `/telemetry/latest/<share mint>` every minute. The backend answers only the origins in its `CORS_ORIGINS`, so the frontend's origin must be listed there. |
| `NEXT_PUBLIC_INDEXER_URL` | `lib/api/indexer.ts`, `next.config.mjs` | Unset: payout history comes from the chain. Set: from the [indexer API](#indexer-api-read-by-the-frontend), which the backend serves; its base URL. |
| `NEXT_PUBLIC_PUBLISHED_DATA_URL` | `lib/api/published.ts`, `next.config.mjs` | `/demo-data` on test networks (the seed's files in `frontend/public/demo-data`), unset on mainnet. The base of the [published car data](#published-car-data-read-by-verify) the asset page's "Check the car's data yourself" hashes; `<backend>/published` for the backend's cars. An absolute URL's origin is added to the CSP, and that server must allow CORS (the backend answers the origins in its `CORS_ORIGINS`). |
| `NEXT_PUBLIC_SITE_URL` | `lib/actions/http.ts` | Unset: the [Blinks](#solana-actions-blinks) take their absolute links and icon from the request's host (`X-Forwarded-Host` behind a proxy). |
| `NEXT_PUBLIC_DEMO_ACCESS` | `lib/demo/config.ts` | Unset. `1` shows the [judge demo](#judge-demo-api) entry points (the demo banner, the mobile menu and the car page) and the `/demo` page, on devnet and localnet only. The routes themselves also need the server variables below. |
| `NEXT_PUBLIC_E2E` | `lib/solana/e2eBurnerWallet.ts` | Unset. `1` adds the "E2E Burner" wallet to the wallet picker, on any cluster but `mainnet-beta`. It signs with a secret key kept in `localStorage`, for the Playwright suite in `frontend/e2e` ([CONTRIBUTING.md](../CONTRIBUTING.md#end-to-end-tests)), which sets it. Never set it on a deployment. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `lib/demo/config.ts`, `next.config.mjs` | Unset. With `TURNSTILE_SECRET`, the access request shows a Cloudflare Turnstile check; the CSP then allows `challenges.cloudflare.com` scripts and frames. |

Server-only variables of the judge demo (never `NEXT_PUBLIC_`, read per request by `lib/demo/server/env.ts`; missing ones make every demo route answer 503 with their names):

| Variable | Holds |
|---|---|
| `DEMO_FAUCET_SECRET` | The faucet: fee payer and SOL pool of every demo transaction, and mint authority of the test tenge. It pays the rent the other roles need in the same transaction, so it is the only key to fund: about 0.018 SOL per judge and 0.0024 SOL per simulated month. |
| `DEMO_KYC_SECRET` | `Config.demo_kyc_authority`. The program lets it write DEMO records for at most 30 days and nothing else. |
| `DEMO_DESK_SECRET` | The desk wallet, which holds the demo fleet car's share inventory. |
| `DEMO_OPERATOR_SECRET`, `DEMO_ORACLE_SECRET` | The demo fleet car's operator and oracle. |
| `DEMO_FLEET_MINT` | Share mint of the demo fleet car (`demo.demo_fleet` in the seed's output). |
| `DEMO_SESSION_SECRET` | Signs nonces and sessions (HMAC-SHA256); at least 32 characters. |
| `DEMO_RPC_URL` | Optional server-side RPC for the demo routes and Blinks, e.g. a keyed Helius URL. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Optional. The limits in Upstash Redis, shared by every serverless instance; without them each server process keeps its own. |
| `TURNSTILE_SECRET` | Optional. The access request must carry a solved Turnstile token. |

Keys are base58 secret keys or `solana-keygen` JSON arrays. `DEMO_SEED_SECRET=… node frontend/scripts/demo-env.mjs --cluster devnet --fleet <mint>` prints the five keys the seed derived for a cluster (HKDF, as `scripts/seed-devnet/lib/keys.ts`) and a fresh session secret; `--public` prints only the addresses, to compare with the seed's output. The admin, KYC authority, treasury and upgrade keys never reach the web server.

## Indexer API (read by the frontend)

The chain records every revenue deposit (`RevenuePeriod`) and every position, but not how many shares a wallet held when a deposit arrived, nor its past claims (those are `Claimed` events in transaction logs). A wallet's part of each deposit therefore needs an indexer. The backend serves it from its [event index](#program-events-what-is-indexed). The frontend reads it when `NEXT_PUBLIC_INDEXER_URL` is set and validates the answer with Zod (`lib/api/indexer.ts`); without it, `/payouts` lists each deposit with its amount per share, and the totals come from the positions.

```
GET /v2/wallets/:wallet/payouts
```

**Response `200`:**
```ts
interface PayoutHistory {
  wallet: string;
  slot: number | null;    // newest slot the index holds a transaction of: the figures are as of it
  projects: Array<{       // every project in which the wallet opened a position, in that order
    project: string;      // project PDA, base58
    mint: string | null;  // share mint, from the indexed ProjectCreated
    shares: string;       // u64: shares the wallet holds now
    claimed: string;      // u64: everything its claims paid out
    pending: string;      // u64: what `claim` pays now,
                          // accrued + floor(shares × (acc_per_share − checkpoint) / 2^64)
  }>;
  periods: Array<{        // newest first
    id: number;           // the event's id in the index; ids grow in chain order
    project: string;      // project PDA, base58
    index: number;        // RevenuePeriod.index
    periodStart: number;  // YYYYMMDD
    periodEnd: number;    // YYYYMMDD
    kind: 'regular' | 'final';
    net: string;          // u64 as a decimal string: paid in for holders, after the fee
    supply: string;       // u64: shares the deposit was split across
    depositedAt: number;  // unix seconds, the deposit's block time (= RevenuePeriod.deposited_at)
    signature: string;    // deposit transaction
    earned: string;       // u64: what this deposit added to the wallet's position,
                          // floor(shares held × (acc_after − acc_before) / 2^64)
  }>;
  claims: Array<{         // newest first
    id: number;
    project: string;      // project PDA
    amount: string;       // u64, from the Claimed event
    claimedAt: number;    // unix seconds, block time
    signature: string;
  }>;
}
```

- **`periods`** holds the deposits of every project in which the wallet held shares when the deposit was made. Amounts are strings because they can exceed 2^53.
- **`pending` is exact.** The backend replays the wallet's position from the project's events with the program's own math (`math.rs`): the position opens at the accumulator of its `PositionOpened`, `SharesPurchased` and `Refunded` change its shares, and it is settled where the program settles it: on a `SharesTransferred` on either side, a `Claimed` (which then empties it), a `RecoveryExecuted` on either side (which also moves `accrued_moved`), and a `PositionClosed`. Each `RevenueDeposited` moves the accumulator to its `acc_after`. Settling over the whole accumulator can pay one base unit more than the sum of `earned`, which each round down on their own; `pending` is what `claim` pays.
- `depositedAt` and `claimedAt` are `null` only if the RPC reported no block time for the transaction.
- A wallet without positions gets empty lists. **`400`:** `wallet` is not a base58 public key.
- The frontend leaves out projects the chain does not know, and shows any other answer as a failed read with a retry.

## Published Car Data (read by "Verify")

The chain keeps fingerprints of each car's off-chain records: the telemetry hash chain head (`Project.telemetry_head`, `telemetry_count`, `last_telemetry_date`), each deposit's `report_hash` and `telemetry_head` snapshot (`RevenuePeriod`), and the purchase papers' `acquisition_doc_hash`. The asset page downloads the published records and recomputes every fingerprint in the browser (`lib/verify/`).

This is the one layout for published car data. Two publishers write it:
- **The demo seed** (`scripts/seed-devnet/publish.ts`) writes the fictional fleet's files, served statically from `frontend/public/demo-data` (`NEXT_PUBLIC_PUBLISHED_DATA_URL` defaults to `/demo-data` on test networks).
- **The backend** serves each car of `FLEET_CONFIG` under `<backend>/published` ([Published Car Data](#published-car-data)).

```
GET <base>/<share mint>/index.json
GET <base>/<share mint>/<file>          every file named by the index
```

`index.json` (fields the frontend reads; both publishers write more):
```ts
interface CarIndex {
  mint: string;                 // must equal the share mint in the URL
  data_origin?: string;         // "devnet-demo-seed" marks fictional demo data; the backend
                                // writes "yandex_fleet", "simulated" or "mixed"
  telemetry: {
    months: Array<{ month: string; file: string }>;   // oldest first, e.g. "telemetry/2026-06.json"
  };
  reports: Array<{ id: string; file: string; period_index: number | null }>;
  acquisition: { file: string } | null;
}
```

A month file:
```ts
interface TelemetryMonth {
  days: Array<{
    record: object;       // the raw daily record; it must carry "date": "YYYY-MM-DD"
    data_hash?: string;   // hex SHA-256 of the record's RFC 8785 canonical JSON
    head?: string;        // hex chain head after this day
  }>;
}
```

What the backend writes:
- **`index.json`**: `schema: "axel.car-data/v1"`, `mint`, `project`, `data_origin` (of the published days; the car's configured source before the first), `telemetry` (`days`, `last_date`, `head`, the chain rule, and `months` with each month's `days` and last `head`), `reports`, and `acquisition: null`: the backend does not hold the purchase documents.
- **`telemetry/<YYYY-MM>.json`**: `schema: "axel.telemetry.month/v1"`, `mint`, `month`, `data_origin`, `head_before`, `head_after`, and `days` with every `record`, `data_hash` and `head`. Only days whose batch is confirmed on-chain are published, in chain order, starting with the chain's first day. A car whose chain another writer started publishes no days here, since a reader rebuilds the head from 32 zero bytes.
- **`reports/<report hash>.json`**: the report's canonical text, byte for byte. `reports` in the index lists each report whose deposit the event index has seen, with that deposit's `period_index` and `deposit_tx`. With `INDEXER_ENABLED=false` it stays empty.

The check, in order:
1. Every `record` is canonicalized (RFC 8785) and hashed with SHA-256; a stated `data_hash` must match.
2. Days must be real calendar days in strictly increasing order.
3. The chain starts from 32 zero bytes and steps `head = SHA-256(head ‖ date as u32 little-endian ‖ data_hash)`, as `record_telemetry` does; a stated `head` must match.
4. After `telemetry_count` days the rebuilt head and last date must equal the project's. More published days than on-chain is reported as ahead; fewer, as not finished.
5. Each report file with a `period_index` is hashed the same way and compared with that period's `report_hash`; each period's `telemetry_head` is looked up among the rebuilt heads. A period with no published report is checked against the report the demo's "Simulate a month" attests (`lib/demo/simulation.ts`), which holds only fields of the period account; a match is shown as a simulated demo month rather than a missing report.
6. After activation, the acquisition file is compared with `acquisition_doc_hash`.

File paths in the index must be relative `.json` paths inside the car's folder. A missing index (404) is reported as "nothing published".

## Judge Demo API

Next.js route handlers under `frontend/src/app/api/demo/` let a judge run the whole cycle on devnet with nothing but a wallet (`lib/demo/`). They exist on devnet and localnet only and answer 404 on any other cluster. Every answer is JSON with `Cache-Control: no-store`; a refusal is `{ code, message, retryAfter?, reason?, signature? }`, where `code` is one of `DEMO_ERROR_CODES` in `lib/demo/config.ts` (the app shows each in EN / RU / KK) and `reason` is the translated cause of a transaction Solana refused. A route that sent its transaction waits up to 30 s for confirmation and otherwise answers `confirmed: false`; the app then confirms it itself.

| Route | Does | Limits |
|---|---|---|
| `GET /api/demo/nonce?wallet=` | A nonce (HMAC-signed, stateless, valid 5 minutes) and the exact message to sign with it | |
| `POST /api/demo/access {wallet, nonce, signature, turnstileToken?}` | Checks the wallet's Ed25519 signature of the message (and Turnstile when configured). Then, in one faucet-paid transaction: `set_investor` (DEMO, 29 days, signed by the demo KYC key after the faucet sends it the record's rent), the wallet's tKZT account, 50,000 tKZT minted to it and 0.01 SOL. A wallet with a valid KYC record keeps it and only gets the drip; an expired DEMO record is renewed; a revoked, frozen or lapsed real record is refused (`kyc_locked`). Answers a session token (7 days) for the next two routes | Once per wallet (a returning wallet only gets a new session), 3 per IP address per UTC day, 80 in total. Refused below 0.05 SOL in the faucet |
| `POST /api/demo/shares {wallet, session}` | The desk sends 5 shares of the demo fleet car: `open_position` (rent paid by the faucet) and the hooked `transfer_checked`, which checks both KYC records and settles both positions first | Once per wallet; the wallet must be eligible for the car |
| `POST /api/demo/simulate-month {wallet, session}` | The faucet sends the operator the new period's rent and mints it the month's income; the operator deposits it with `deposit_revenue`, co-signed by the car's oracle. The month is the calendar month after the latest one the car's payouts cover, the amount the average of its latest three regular payouts in whole tokens, and the report hash that of a report which says it is simulated | One per minute across all wallets (`429` with `Retry-After`), 3 per wallet per UTC day, 150 payouts on the car |
| `GET /api/demo/status[?wallet=]` | Whether access can be granted now, the faucet's balance, the limits, the fleet car (state, payouts, desk inventory, cooldown) and the wallet's one-time steps. `503` with the same body when the demo is unavailable, `code` saying why | |

The server checks its configuration against the chain on each call: the demo KYC key must be `Config.demo_kyc_authority`, the faucet the payment mint's mint authority, and the operator and oracle keys the fleet car's; otherwise the route answers `misconfigured`.

The `/demo` page walks through the path: access → buy in an open raise (the app's own purchase dialog) → receive shares → simulate a month → claim → verify the car's data → proof of solvency. Each step's state is read from the chain, so the path continues on another device.

## Solana Actions (Blinks)

`frontend/src/app/api/actions/` implements the [Solana Actions](https://solana.com/docs/advanced/actions) spec, so a car can be bought or its payout claimed from a post on X or Telegram. Every response carries the spec's CORS headers, `X-Action-Version: 2.4` and, on a public cluster, `X-Blockchain-Ids` (devnet: `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`); `OPTIONS` answers the preflight. The transactions are unsigned, with the reader's account as fee payer.

| Route | GET | POST `{ account }` |
|---|---|---|
| `/api/actions/invest/[mint]` | The car's photo, price, raise progress, escrow and refund rule; buttons for 1, 3 and 5 shares (those that are left) and a number field. A car not raising is shown disabled | `?shares=N`: `buy_shares` capped at N × price. Refused with a message when the raise is closed, N is not a whole number of shares left, the wallet has no eligible KYC record (with the link to `/demo` on a demo deployment) or too little of the payment token |
| `/api/actions/claim/[mint]` | The car's payouts so far and one "Claim payout" button; disabled before the car pays out | `claim` to the wallet's own account, when it holds a position with something to claim and is not frozen; the message names the amount |

`GET /actions.json` maps `/assets/*` (and `/ru/assets/*`, `/kk/assets/*`) to the invest action. The car page links both Blinks on dial.to (`?action=solana-action:<url>&cluster=devnet`).

## Program Reference: `axel_v2`

- Program ID: `AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi` (not deployed yet).
- IDL: `target/idl/axel_v2.json` and `target/types/axel_v2.ts`, produced by `anchor build`. They are vendored in `frontend/src/lib/solana/idl-v2/` and `backend/src/solana/idl/`, and CI fails when a vendored copy differs from a fresh build.
- Anchor instruction discriminators are the first 8 bytes of `sha256("global:<instruction_name>")`; `execute` uses the SPL transfer-hook interface's `Execute` discriminator instead.
- Design, rules and the test behind each check: [v2.md](v2.md). This section lists the interface as the IDL defines it.

How to read the account lists:
- Accounts are listed in order.
- `mut` means writable; `signer` means the account must sign.
- `= project.operator` means the account must equal that field (Anchor `has_one` / `relations`).
- In PDA seeds, strings are UTF-8 bytes, account names are the account's address, and the period index is 4 little-endian bytes.
- "ATA of X for Y" is X's associated token account for mint Y, under the mint's token program.

Argument types:

```rust
struct InitializeConfigParams { admin: Pubkey, kyc_authority: Pubkey, demo_kyc_authority: Pubkey, treasury: Pubkey,
    raise_fee_bps: u16, revenue_fee_bps: u16, min_raise_duration: i64, max_activation_window: i64,
    allowed_payment_mints: [Pubkey; 4], recovery_delay: i64 }
struct UpdateConfigParams { kyc_authority: Option<Pubkey>, demo_kyc_authority: Option<Pubkey>, treasury: Option<Pubkey>,
    raise_fee_bps: Option<u16>, revenue_fee_bps: Option<u16>, min_raise_duration: Option<i64>,
    max_activation_window: Option<i64>, allowed_payment_mints: Option<[Pubkey; 4]>, paused: Option<bool>,
    recovery_delay: Option<i64> }
struct SetInvestorParams { status: InvestorStatus, expires_at: i64, jurisdiction: u16, flags: u8, provider: KycProvider }
struct CreateProjectParams { price_per_share: u64, total_shares: u64, soft_cap_shares: u64, raise_deadline: i64,
    activation_window: i64, operator: Pubkey, oracle: Pubkey, allow_demo: bool, name: String, symbol: String,
    uri: String, additional_metadata: Vec<MetadataField> }
struct MetadataField { key: String, value: String }
struct DepositRevenueParams { gross: u64, period_start: u32, period_end: u32, report_hash: [u8; 32], kind: RevenueKind }
struct TelemetryEntry { date: u32, data_hash: [u8; 32], trips: u16, km: u32, rent_paid: u32, status: u8 }

enum InvestorStatus { None, Active, Revoked, Frozen }
enum KycProvider { Manual, Sumsub, Demo }
enum RevenueKind { Regular, Final }
enum ProjectState { Fundraising, Funded, Operating, Paused, Failed, Closed }
```

- Times are unix seconds (`i64`); dates are `YYYYMMDD` (`u32`) and must be real calendar days.
- Amounts are base units of the project's payment mint. `price_per_share × total_shares` must fit in a `u64`.
- `Investor.flags`: `1` DEMO (verified through the devnet demo; a project must set `allow_demo` to accept it), `2` QUALIFIED, `4` PROGRAM (a program-owned wallet). `jurisdiction` is an ISO 3166-1 numeric code (0 when unknown).
- `TelemetryEntry.status`: see [Telemetry: what is published](#telemetry-what-is-published).

### Config and admin handover

#### `initialize_config(params: InitializeConfigParams)`

Creates the global config. Only the program's upgrade authority may call it.

`authority` (mut, signer) · `config` (mut, PDA `["config"]`) · `program` (`AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi`) · `program_data` · `system_program` (System program)

#### `update_config(params: UpdateConfigParams)`

Updates fees, windows, payment mints, pause flag and KYC keys. Admin only.

`admin` (signer, = config.admin) · `config` (mut, PDA `["config"]`)

#### `propose_admin(new_admin: pubkey)`

First step of the admin handover. The default key withdraws a pending proposal.

`admin` (signer, = config.admin) · `config` (mut, PDA `["config"]`)

#### `accept_admin()`

Second step of the admin handover, signed by the proposed admin.

`pending_admin` (signer) · `config` (mut, PDA `["config"]`)

### KYC

#### `set_investor(wallet: pubkey, params: SetInvestorParams)`

Creates or updates the KYC record of `wallet`. Signed by the KYC authority, or by the demo KYC authority for DEMO records that expire within 30 days.

`authority` (mut, signer) · `config` (PDA `["config"]`) · `investor` (mut, PDA `["investor", arg wallet]`) · `system_program` (System program)

### Raise

#### `create_project(params: CreateProjectParams)`

Creates a share mint, its transfer hook accounts, the project and its escrow and revenue vaults, and opens the raise. Admin only.

`payer` (mut, signer) · `admin` (signer, = config.admin) · `config` (mut, PDA `["config"]`) · `share_mint` (mut, signer) · `project` (mut, PDA `["project", share_mint]`) · `extra_account_metas` (mut, PDA `["extra-account-metas", share_mint]`) · `payment_mint` · `escrow_vault` (mut, PDA `["escrow", project]`) · `revenue_vault` (mut, PDA `["revenue", project]`) · `share_token_program` (Token-2022) · `payment_token_program` · `system_program` (System program)

#### `buy_shares(shares: u64, max_total_cost: u64)`

Buys shares in an open raise; payment goes to the escrow. Moves the project to Funded when the last share is sold.

`payer` (mut, signer) · `owner` (signer) · `config` (PDA `["config"]`) · `investor` (PDA `["investor", owner]`) · `project` (mut, PDA `["project", share_mint]`) · `position` (mut, PDA `["position", project, owner]`) · `share_mint` (mut, = project.share_mint) · `owner_share_account` (mut, ATA of owner for share_mint) · `payment_mint` (= project.payment_mint) · `owner_payment_account` (mut) · `escrow_vault` (mut, = project.escrow_vault) · `share_token_program` (Token-2022) · `payment_token_program` · `associated_token_program` (Associated Token program) · `system_program` (System program)

#### `finalize_raise()`

Settles a raise whose outcome is certain: Funded or Failed. Anyone may call it.

`project` (mut, PDA `["project", project.share_mint]`)

#### `activate_project(acquisition_doc_hash: [u8; 32])`

Pays a funded raise out to the treasury and the operator and starts operation. Admin only, before the activation deadline.

`admin` (mut, signer, = config.admin) · `config` (PDA `["config"]`) · `project` (mut, PDA `["project", project.share_mint]`) · `payment_mint` (= project.payment_mint) · `escrow_vault` (mut, = project.escrow_vault) · `treasury` (= config.treasury) · `treasury_token_account` (mut, ATA of treasury for payment_mint) · `operator` (= project.operator) · `operator_token_account` (mut, ATA of operator for payment_mint) · `payment_token_program` · `associated_token_program` (Associated Token program) · `system_program` (System program)

#### `cancel_raise()`

Fails a raise that has not been activated, opening refunds. Admin only.

`admin` (signer, = config.admin) · `config` (PDA `["config"]`) · `project` (mut, PDA `["project", project.share_mint]`)

#### `refund()`

Burns the owner's shares of a failed raise and returns what they cost.

`owner` (mut, signer) · `investor` (PDA `["investor", owner]`) · `project` (mut, PDA `["project", share_mint]`) · `position` (mut, PDA `["position", project, owner]`) · `share_mint` (mut, = project.share_mint) · `owner_share_account` (mut, ATA of owner for share_mint) · `payment_mint` (= project.payment_mint) · `owner_payment_account` (mut, ATA of owner for payment_mint) · `escrow_vault` (mut, = project.escrow_vault) · `share_token_program` (Token-2022) · `payment_token_program` · `associated_token_program` (Associated Token program) · `system_program` (System program)

### Positions and transfers

#### `open_position()`

Opens the owner's position and thaws its share account so it can receive shares. Anyone may pay; the owner needs an eligible KYC record but does not sign.

`payer` (mut, signer) · `owner` · `investor` (PDA `["investor", owner]`) · `project` (PDA `["project", share_mint]`) · `position` (mut, PDA `["position", project, owner]`) · `share_mint` (= project.share_mint) · `owner_share_account` (mut, ATA of owner for share_mint) · `share_token_program` (Token-2022) · `associated_token_program` (Associated Token program) · `system_program` (System program)

#### `close_position()`

Closes an empty position and its share account, returning the rent to the owner. Once the project is closed it also burns the shares left in the position.

`owner` (mut, signer) · `project` (mut, PDA `["project", share_mint]`) · `position` (mut, PDA `["position", project, owner]`) · `share_mint` (mut, = project.share_mint) · `owner_share_account` (mut, ATA of owner for share_mint) · `share_token_program` (Token-2022) · `associated_token_program` (Associated Token program) · `system_program` (System program)

#### `execute(amount: u64)`

Transfer hook of the share mints, invoked by Token-2022 on every share transfer. Settles revenue for both owners, moves the shares in their positions and rejects the transfer unless both owners are eligible and the project is operating.

`source` · `mint` · `destination` · `authority` · `extra_account_metas` · `config` (PDA `["config"]`) · `project` (PDA `["project", mint]`) · `source_investor` · `destination_investor` · `source_position` (mut) · `destination_position` (mut)

### Revenue and telemetry

#### `deposit_revenue(params: DepositRevenueParams)`

The operator pays in one period's revenue, co-signed by the project's oracle as attestor. The platform fee goes to the treasury, the rest to the holders pro rata.

`operator` (mut, signer, = project.operator) · `oracle` (signer, = project.oracle) · `config` (PDA `["config"]`) · `project` (mut, PDA `["project", project.share_mint]`) · `period` (mut, PDA `["period", project, project.period_count]`) · `payment_mint` (= project.payment_mint) · `operator_payment_account` (mut) · `revenue_vault` (mut, = project.revenue_vault) · `treasury` (= config.treasury) · `treasury_token_account` (mut, ATA of treasury for payment_mint) · `payment_token_program` · `associated_token_program` (Associated Token program) · `system_program` (System program)

#### `claim()`

Pays a position's unclaimed revenue to the owner's canonical payment account. Anyone may trigger it for any owner.

`claimer` (mut, signer) · `owner` · `investor` (PDA `["investor", owner]`) · `project` (mut, PDA `["project", project.share_mint]`) · `position` (mut, PDA `["position", project, owner]`) · `payment_mint` (= project.payment_mint) · `owner_payment_account` (mut, ATA of owner for payment_mint) · `revenue_vault` (mut, = project.revenue_vault) · `payment_token_program` · `associated_token_program` (Associated Token program) · `system_program` (System program)

#### `record_telemetry(entries: Vec<TelemetryEntry>)`

Appends up to 20 daily records to the project's telemetry hash chain. Oracle only.

`oracle` (signer, = project.oracle) · `project` (mut, PDA `["project", project.share_mint]`)

### Project operations

#### `pause_project()`

Pauses an operating project: no transfers or deposits, claims keep working. Admin only.

`admin` (signer, = config.admin) · `config` (PDA `["config"]`) · `project` (mut, PDA `["project", project.share_mint]`)

#### `resume_project()`

Resumes a paused project. Admin only.

`admin` (signer, = config.admin) · `config` (PDA `["config"]`) · `project` (mut, PDA `["project", project.share_mint]`)

#### `set_project_roles(operator: Option<pubkey>, oracle: Option<pubkey>)`

Replaces the operator or the oracle of an operating or paused project. Admin only.

`admin` (signer, = config.admin) · `config` (PDA `["config"]`) · `project` (mut, PDA `["project", project.share_mint]`)

#### `close_project()`

Closes an operating or paused project for good without moving any funds; revenue stays claimable. Admin only.

`admin` (signer, = config.admin) · `config` (PDA `["config"]`) · `project` (mut, PDA `["project", project.share_mint]`)

### Recovery

#### `propose_recovery(shares: u64, reason_hash: [u8; 32])`

Proposes moving `shares` of `from_owner`, a holder who lost its key, to its new wallet `to_owner` once `config.recovery_delay` has passed. Admin only.

`admin` (mut, signer, = config.admin) · `config` (PDA `["config"]`) · `project` (PDA `["project", project.share_mint]`) · `from_owner` · `from_investor` (PDA `["investor", from_owner]`) · `from_position` (PDA `["position", project, from_owner]`) · `to_owner` · `to_investor` (PDA `["investor", to_owner]`) · `request` (mut, PDA `["recovery", project, from_owner]`) · `system_program` (System program)

#### `cancel_recovery()`

Withdraws a pending recovery: the affected owner can veto it until its eta, the admin can withdraw it until it is executed.

`authority` (signer) · `config` (PDA `["config"]`) · `request` (mut, PDA `["recovery", request.project, request.from_owner]`) · `proposer` (mut, = request.proposer)

#### `execute_recovery()`

Carries out a recovery after its delay: burns the shares of the old wallet, mints as many to the new one and moves the unclaimed revenue with them. Anyone may call it.

`executor` (mut, signer) · `config` (PDA `["config"]`) · `project` (PDA `["project", share_mint]`) · `request` (mut, PDA `["recovery", project, from_owner]`) · `proposer` (mut, = request.proposer) · `share_mint` (mut, = project.share_mint) · `from_owner` · `from_investor` (PDA `["investor", from_owner]`) · `from_position` (mut, PDA `["position", project, from_owner]`) · `from_share_account` (mut, ATA of from_owner for share_mint) · `to_owner` (= request.to_owner) · `to_investor` (PDA `["investor", to_owner]`) · `to_position` (mut, PDA `["position", project, to_owner]`) · `to_share_account` (mut, ATA of to_owner for share_mint) · `share_token_program` (Token-2022) · `associated_token_program` (Associated Token program) · `system_program` (System program)

`execute` is called by Token-2022 during `transfer_checked`, never by clients. Token-2022 resolves the six extra accounts from the validation account at `["extra-account-metas", share_mint]`: the config and the project as fixed addresses, the two `Investor` PDAs from the token accounts' owners, and the two `Position` PDAs. A client adds them to the transfer in that order, followed by the program ID and the validation account ([TypeScript Client](#typescript-client-frontend-axel_v2)).

### Accounts

Sizes, rent and the `getProgramAccounts` memcmp offsets are in [v2.md](v2.md#accounts-and-seeds).

| Account | Fields after the 8-byte discriminator |
|---|---|
| `Config` | `admin: pubkey`, `pending_admin: pubkey`, `kyc_authority: pubkey`, `demo_kyc_authority: pubkey`, `treasury: pubkey`, `raise_fee_bps: u16`, `revenue_fee_bps: u16`, `min_raise_duration: i64`, `max_activation_window: i64`, `allowed_payment_mints: [pubkey; 4]`, `paused: bool`, `project_count: u64`, `bump: u8`, `recovery_delay: i64` |
| `Investor` | `wallet: pubkey`, `status: InvestorStatus`, `flags: u8`, `jurisdiction: u16`, `expires_at: i64`, `updated_at: i64`, `provider: KycProvider`, `bump: u8` |
| `Position` | `project: pubkey`, `owner: pubkey`, `shares: u64`, `acc_checkpoint: u128`, `accrued: u64`, `total_claimed: u64`, `paid_in: u64`, `bump: u8` |
| `Project` | `share_mint: pubkey`, `payment_mint: pubkey`, `payment_token_program: pubkey`, `operator: pubkey`, `oracle: pubkey`, `escrow_vault: pubkey`, `revenue_vault: pubkey`, `state: ProjectState`, `flags: u8`, `price_per_share: u64`, `total_shares: u64`, `soft_cap_shares: u64`, `shares_sold: u64`, `shares_refunded: u64`, `raise_deadline: i64`, `activation_window: i64`, `activation_deadline: i64`, `created_at: i64`, `activated_at: i64`, `closed_at: i64`, `raise_fee_bps: u16`, `revenue_fee_bps: u16`, `acc_per_share: u128`, `total_deposited_net: u64`, `total_fees: u64`, `total_claimed: u64`, `total_refunded: u64`, `period_count: u32`, `telemetry_head: [u8; 32]`, `telemetry_count: u32`, `last_telemetry_date: u32`, `acquisition_doc_hash: [u8; 32]`, `bump: u8`, `escrow_bump: u8`, `revenue_bump: u8`, `shares_retired: u64` |
| `RecoveryRequest` | `project: pubkey`, `from_owner: pubkey`, `to_owner: pubkey`, `shares: u64`, `reason_hash: [u8; 32]`, `proposer: pubkey`, `proposed_at: i64`, `eta: i64`, `bump: u8` |
| `RevenuePeriod` | `project: pubkey`, `index: u32`, `period_start: u32`, `period_end: u32`, `gross: u64`, `fee: u64`, `net: u64`, `supply: u64`, `acc_after: u128`, `report_hash: [u8; 32]`, `attestor: pubkey`, `telemetry_head: [u8; 32]`, `kind: RevenueKind`, `deposited_at: i64`, `bump: u8` |

`Project.flags`: `1` ALLOW_DEMO. `acc_per_share` and `acc_checkpoint` are Q64.64 fixed point ([v2.md](v2.md#revenue-math)).

### Event Types

Every instruction that changes state emits one or more of these 23 events (`emit!`, logged as `Program data:`). The backend indexes all of them ([Program Events](#program-events-what-is-indexed)).

| Event | Fields |
|---|---|
| `AdminChanged` | `previous_admin`, `new_admin` |
| `AdminProposed` | `admin`, `pending_admin` |
| `Claimed` | `project`, `owner`, `claimer`, `amount` |
| `ConfigUpdated` | `admin`, `kyc_authority`, `demo_kyc_authority`, `treasury`, `raise_fee_bps`, `revenue_fee_bps`, `min_raise_duration`, `max_activation_window`, `allowed_payment_mints`, `paused`, `recovery_delay` |
| `InvestorUpdated` | `wallet`, `status`, `flags`, `jurisdiction`, `expires_at`, `provider`, `authority` |
| `PositionClosed` | `project`, `owner`, `shares_burned` |
| `PositionOpened` | `project`, `owner`, `payer` |
| `ProjectActivated` | `project`, `gross`, `fee`, `operator_amount`, `acquisition_doc_hash` |
| `ProjectClosed` | `project`, `unclaimed` |
| `ProjectCreated` | `project`, `share_mint`, `payment_mint`, `operator`, `price_per_share`, `total_shares`, `soft_cap_shares`, `raise_deadline` |
| `ProjectPaused` | `project` |
| `ProjectResumed` | `project` |
| `RaiseCancelled` | `project`, `previous_state` |
| `RaiseFinalized` | `project`, `outcome`, `shares_sold` |
| `RecoveryCancelled` | `project`, `from_owner`, `to_owner`, `shares`, `cancelled_by` |
| `RecoveryExecuted` | `project`, `from_owner`, `to_owner`, `shares`, `accrued_moved`, `reason_hash`, `executor` |
| `RecoveryProposed` | `project`, `from_owner`, `to_owner`, `shares`, `reason_hash`, `proposer`, `eta` |
| `Refunded` | `project`, `owner`, `shares`, `amount` |
| `RevenueDeposited` | `project`, `index`, `period_start`, `period_end`, `gross`, `fee`, `net`, `supply`, `acc_after`, `report_hash`, `attestor`, `kind` |
| `RolesUpdated` | `project`, `operator`, `oracle` |
| `SharesPurchased` | `project`, `owner`, `payer`, `shares`, `cost`, `shares_sold` |
| `SharesTransferred` | `project`, `from`, `to`, `amount` |
| `TelemetryRecorded` | `project`, `date`, `data_hash`, `trips`, `km`, `rent_paid`, `status`, `head`, `count` |

### Errors (`AxelError`)

Codes are only ever appended, so a code keeps its meaning across upgrades. The frontend has a message for each in `messages/*.json` (`ProgramErrors`).

| Code | Name | Message |
|---|---|---|
| 6000 | `Unauthorized` | Signer is not authorized for this action |
| 6001 | `InvalidAddress` | Address must not be the default public key |
| 6002 | `FeeTooHigh` | Fee exceeds the protocol hard cap |
| 6003 | `InvalidDuration` | Duration must be greater than zero and within the protocol cap |
| 6004 | `DuplicatePaymentMint` | Allowed payment mints contain a duplicate |
| 6005 | `DemoAuthorityConflict` | Demo KYC authority must differ from the KYC authority |
| 6006 | `AdminUnchanged` | New admin must differ from the current admin |
| 6007 | `NoPendingAdmin` | There is no pending admin to accept |
| 6008 | `InvalidInvestorStatus` | Investor status None cannot be assigned |
| 6009 | `InvalidInvestorFlags` | Investor flags contain unknown bits |
| 6010 | `InvalidExpiry` | An active investor must expire in the future |
| 6011 | `InvalidJurisdiction` | Jurisdiction must be an ISO 3166-1 numeric code |
| 6012 | `DemoScopeViolation` | Demo KYC key may only grant or revoke DEMO access with the Demo provider |
| 6013 | `DemoExpiryTooLong` | Demo KYC access cannot last longer than 30 days |
| 6014 | `DemoRecordImmutable` | Demo KYC key cannot modify a frozen or non-DEMO investor record |
| 6015 | `InvestorNotActive` | Investor KYC is not active |
| 6016 | `InvestorExpired` | Investor KYC has expired |
| 6017 | `InvestorFrozen` | Investor is frozen |
| 6018 | `DemoNotAllowed` | Project does not accept DEMO investors |
| 6019 | `InvalidState` | Instruction is not allowed in the current project state |
| 6020 | `ProtocolPaused` | Protocol is paused |
| 6021 | `PaymentMintNotAllowed` | Payment mint is not in the allowlist |
| 6022 | `UnsupportedPaymentMint` | Payment mint has an unsupported Token-2022 extension |
| 6023 | `InvalidPrice` | Price per share must be greater than zero |
| 6024 | `InvalidShareSupply` | Share supply must satisfy 0 < soft cap <= total shares |
| 6025 | `RaiseTooShort` | Raise duration is shorter than the configured minimum |
| 6026 | `ActivationWindowTooLong` | Activation window exceeds the configured maximum |
| 6027 | `RaiseEnded` | Raise deadline has passed |
| 6028 | `RaiseNotFinalizable` | Raise cannot be finalized yet |
| 6029 | `ExceedsSupply` | Purchase exceeds the remaining shares |
| 6030 | `SlippageExceeded` | Total cost exceeds the allowed maximum |
| 6031 | `ZeroAmount` | Amount must be greater than zero |
| 6032 | `ActivationExpired` | Activation deadline has passed |
| 6033 | `ZeroSupply` | There are no outstanding shares |
| 6034 | `NotTransferring` | Hook was invoked outside of a Token-2022 transfer |
| 6035 | `SourceNotAllowed` | Sender is not allowed to transfer shares |
| 6036 | `DestinationNotAllowed` | Recipient is not allowed to hold shares |
| 6037 | `RecipientNotOnboarded` | Recipient has no position in this project |
| 6038 | `ShareMintMismatch` | Mint is not the share mint of this project |
| 6039 | `PositionMismatch` | Position does not match the expected project or owner |
| 6040 | `LedgerMismatch` | Token balance does not match the position ledger |
| 6041 | `InvalidTokenAccount` | Token account is not valid for this operation |
| 6042 | `NothingToClaim` | Nothing to claim |
| 6043 | `NothingToRefund` | Nothing to refund |
| 6044 | `PositionNotEmpty` | Position still holds shares or unclaimed revenue |
| 6045 | `InvalidPeriodDates` | Revenue period dates are invalid |
| 6046 | `TooManyTelemetryEntries` | Too many telemetry entries in one transaction |
| 6047 | `TelemetryDateNotIncreasing` | Telemetry dates must strictly increase |
| 6048 | `Overflow` | Arithmetic overflow |
| 6049 | `DivisionByZero` | Division by zero |
| 6050 | `CheckpointAhead` | Position checkpoint is ahead of the project accumulator |
| 6051 | `InvalidBps` | Basis points exceed 10000 |
| 6052 | `InvalidMetadata` | Token metadata is empty, too long, duplicated or uses a reserved key |
| 6053 | `RoleConflict` | Operator and oracle must be different keys |
| 6054 | `InvalidDocumentHash` | Acquisition document hash must not be empty |
| 6055 | `VaultShortfall` | Vault holds less than the amount it owes |
| 6056 | `InvalidReportHash` | Revenue report hash must not be empty |
| 6057 | `InvalidAttestor` | Revenue deposit must be co-signed by the project's oracle |
| 6058 | `EmptyTelemetryBatch` | Telemetry batch is empty |
| 6059 | `InvalidTelemetryDate` | Telemetry date must be a calendar date as YYYYMMDD |
| 6060 | `InvalidRecoveryDelay` | Recovery delay must be between 1 hour and 30 days |
| 6061 | `InvalidReasonHash` | Recovery reason hash must not be empty |
| 6062 | `RecoveryToSameOwner` | Recovery must move shares to a different wallet |
| 6063 | `InsufficientShares` | Position holds fewer shares than the recovery moves |
| 6064 | `RecoveryNotReady` | Recovery delay has not elapsed |
| 6065 | `VetoWindowClosed` | The owner's veto window has closed |
| 6066 | `RaiseTooLong` | Raise deadline is further away than the protocol cap |

## TypeScript Client (frontend, `axel_v2`)

The frontend talks to `axel_v2` through `@coral-xyz/anchor` and the IDL vendored in `frontend/src/lib/solana/idl-v2/`. `lib/solana/program.ts` builds the `Program` at the configured address; it only builds instructions and decodes accounts, and every read goes through the `Connection` the caller passes.

| Module | What it has |
|---|---|
| `connection.ts` | Cluster, RPC URL and program ID from the environment; Explorer links |
| `pda.ts` | `configAddress`, `investorAddress(wallet)`, `projectAddress(shareMint)`, `positionAddress(project, owner)`, `periodAddress(project, index)`, `escrowAddress(project)`, `revenueAddress(project)`, `extraAccountMetasAddress(shareMint)`; `shareAccountAddress` and `paymentAccountAddress` for the owners' canonical token accounts |
| `accounts.ts` | Decoders from account bytes to plain types with `bigint` amounts; account sizes and the memcmp offsets readers filter by |
| `readers.ts` | `fetchConfig`, `fetchInvestor(wallet)`, `fetchProjects` (one `getProgramAccounts` plus one `getMultipleAccounts` for the share and payment mints), `fetchProject(shareMint)`, `fetchPositions(owner)` (memcmp on the owner at offset 40), `fetchPosition`, `fetchRevenuePeriods(project)` (memcmp at offset 8), `fetchTokenBalance` |
| `tokens.ts` | The car from the share mint's Token-2022 metadata (`make`, `model`, `year`, `city`, `class`, `park`); the payment token's decimals and symbol; sums per payment token |
| `math.ts` | The program's `math.rs` on BigInt: `splitFee`, `sharesValue`, `proRata`, `accIncrement`, `owed`, `deposit`, and `pendingRevenue(position, accPerShare)` = `accrued + (shares × (acc − checkpoint)) >> 64`, which is exactly what a claim pays |
| `instructions.ts` | `buySharesInstruction`, `refundInstruction`, `claimInstruction`, `openPositionInstruction`, `closePositionInstruction`, `transferSharesInstruction`; `finalizeRaiseInstruction`; admin `manageProjectInstruction` (cancel raise, pause, resume, close), `setProjectRolesInstruction`, `activateProjectInstruction`, `depositRevenueInstruction` (the oracle co-signs), `setInvestorInstruction` |
| `transaction.ts` | Compute unit limits per action, `buildTransaction` (limit first), `MAX_CLAIMS_PER_TRANSACTION` = 4, `confirmSignature` |
| `errors.ts` | `describeTxError`: the i18n message of a failed transaction, from Anchor's log line, a program's custom error in the logs or in a signature status (by instruction index), a wallet refusal, missing SOL, an expired blockhash or an unreachable node |
| `eligibility.ts`, `lifecycle.ts`, `kyc.ts` | The program's KYC eligibility rule, what each project state allows, and the records the console's KYC form writes |

`transferSharesInstruction` is a Token-2022 `transfer_checked` with the hook's accounts appended in the order wallets resolve them (config, project, both investors, both positions, the hook program, the validation account), so it needs no RPC call and works in wallets that do not resolve transfer hooks. A recipient without a position is onboarded with `openPositionInstruction` in the same transaction.

Every send goes through `hooks/useTransactionSender.ts`: it sets the compute unit limit, has the wallet sign, polls the signature until confirmed, and shows the outcome in a toast with the Explorer link.

The client is tested in `frontend/src/lib/solana/__tests__` without mocks: builders against the IDL's account lists, flags, fixed addresses and PDA seeds, and exact bytes; the transfer against `@solana/spl-token`'s own hook resolver; readers, math and PDAs against accounts the real program wrote in LiteSVM (`tests-v2/scripts/export-frontend-fixture.ts` exports them, with what each holder's claim paid).

v1 clients build instructions from `target/idl/axel.json` after `anchor build`, as `tests/` and `scripts/init-project.ts` do.

## Codama SDK (`sdk/axel-v2`)

The Codama client covers the v2 program only. `npm run generate` runs `scripts/generate-clients.ts`, which reads `target/idl/axel_v2.json` and renders a `@solana/kit` client into `sdk/axel-v2/src/generated`. See [v2.md](v2.md#idl-and-typescript-client). The stale v1 output that used to live in `sdk/generated` was removed. The frontend keeps using Anchor with the vendored IDL, because the wallet adapter and the existing hooks are built on `@solana/web3.js` 1.

## Legacy Program Reference: `axel` (v1)

- Program ID: `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`
- Deployed on devnet before the hackathon; kept as legacy ([architecture.md](architecture.md#legacy-v1-programs)). The app, the backend and the seed use `axel_v2`.
- IDL: `target/idl/axel.json` and `target/types/axel.ts`, produced by `anchor build`. It is not vendored anywhere.

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

### Accounts (v1)

| Account | Layout after the 8-byte discriminator |
|---|---|
| `ProjectState` | `admin: pubkey`, `mint: pubkey`, `revenue_vault: pubkey`, `token_supply: u64`, `tokens_sold: u64`, `price_per_share: u64`, `status: enum {Active, Paused, Closed}`, `period_count: u32`, `oracle_pubkey: pubkey`, `bump: u8`, `revenue_vault_bump: u8` |
| `RevenuePeriod` | `project: pubkey` (the mint), `period_index: u32`, `total_deposited: u64`, `token_supply_snapshot: u64`, `deposited_at: i64`, `bump: u8` |
| `ClaimRecord` | `claimed: bool`, `bump: u8` |
| `WhitelistEntry` | `approved: bool`, `bump: u8` |
| `TelemetryRecord` | `project: pubkey` (the mint), `date: u32`, `data_hash: [u8; 32]`, `oracle_pubkey: pubkey`, `recorded_at: i64`, `bump: u8` |

### Errors (v1 `AxelError`)

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

## Legacy Program Reference: `transfer_hook` (v1)

- Program ID: `5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`
- Its IDL is produced by `anchor build` at `target/idl/transfer_hook.json`. It is not vendored in the frontend.

| Instruction | Accounts | Notes |
|---|---|---|
| `initialize_extra_account_meta_list()` | `payer` (mut, signer) · `mint` · `extra_account_meta_list` (mut, PDA `["extra-account-metas", mint]`) · `system_program` | Any payer. It must run once per mint before holder-to-holder transfers can work. |
| `execute(amount: u64)` | source token account · mint · destination token account · source owner · `extra_account_meta_list` · axel program · source `WhitelistEntry` · destination `WhitelistEntry` | Called by Token-2022 during `transfer_checked`, not by clients. A `fallback` handler routes the SPL transfer-hook interface discriminator here. |

Errors: `6000 SourceNotWhitelisted`, `6001 DestinationNotWhitelisted`.

To send shares from a client, build the transfer with `createTransferCheckedWithTransferHookInstruction` or `transferCheckedWithTransferHook` from `@solana/spl-token`, using `TOKEN_2022_PROGRAM_ID`. These helpers resolve the extra accounts from the on-chain list, as `tests/transfer-hook-execute.test.ts` does.
