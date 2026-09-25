# RWA Tokenization of Taxi Vehicle (Solana) — Technical Specification

## 1. Overview

Platform for tokenizing a taxi vehicle with the ability to:

- buy ownership shares (tokens) from the asset owner
- receive income from vehicle operation
- transparent accounting and profit distribution via Solana

**Key architectural principle:** all business logic and state stored on-chain. Frontend reads data directly from Solana RPC. Backend exists only for two tasks that physically cannot run in a browser: signing oracle data and receiving webhooks from KYC provider.

**Business model (v2 — Direct Sale):** The admin (asset owner) already owns the vehicle. Tokens represent fractional ownership. Admin mints all tokens at project initialization, then sells them to whitelisted investors at a fixed price. No fundraising window, no escrow, no refund logic. Supply is permanently fixed (mint authority revoked at creation).

---

## 2. MVP Goals

- Tokenize 1 vehicle
- Sell ownership shares (Token-2022) directly to investors
- Distribute revenue via on-chain claim model
- Restrict access through whitelist (KYC)
- Provide transparency of payouts and telemetry via Yandex Pro

---

## 3. Architecture

```text
[Frontend (Next.js)]
  |  reads PDAs directly      sends transactions
  |---------------------------------------------> [Solana Program]
  |                                               ^
  |  GET /telemetry/latest                        | record_telemetry
  |----------> [Minimal Backend] -----------------+
                     |
             [Yandex Pro API]
          (cron: daily data collection)
                     |
          [KYC Provider (Sumsub)]
          (webhook -> add_to_whitelist)
```

**No database. No state server. State = on-chain.**

---

## 4. On-chain Components (Solana)

### Token Mint — Token Extensions (Token-2022)

Using **Token-2022** (Token Extensions) program instead of classic SPL Token.

- Number of tokens = vehicle value / price per token (e.g.: car $20,000, token $100 -> 200 tokens)
- Fixed supply determined at project initialization and permanently locked (mint authority revoked)
- All extensions configured **at mint creation** — cannot be changed after

#### Token-2022 Extensions Used

| Extension | Level | Application |
| --- | --- | --- |
| **Transfer Hook** | Mint | On every token transfer, calls separate on-chain program — verifies both addresses are in whitelist. Without KYC — transfer impossible at protocol level |
| **Default Account State (Frozen)** | Mint | New token accounts are created frozen. Thawed only after KYC via Freeze Authority |
| **Permanent Delegate** | Mint | Platform can seize and burn tokens if terms violated |
| **Transfer Fee** | Mint | 1% fee on secondary transfers; accumulates in reserve fund |
| **Token Metadata + Metadata Pointer** | Mint | Vehicle metadata directly on mint: VIN, make, year, valuation, license |
| **Memo Transfer** | Account | All transfers contain memo — on-chain audit trail |

### On-chain Accounts (PDAs)

All project state stored in PDAs, readable directly from frontend:

- `ProjectState` — project parameters, status, token vault
- `RevenuePeriod` — each payout period: amount, supply snapshot
- `ClaimRecord` — payout receipt for specific investor per period
- `WhitelistEntry` — KYC-approved wallets
- `TelemetryRecord` — daily hash of Yandex Pro data + oracle signature

### Instructions

- `initialize_project` — create mint, mint all tokens to vault, revoke mint authority
- `buy_tokens` — investor buys tokens from vault at fixed price (atomic SOL-for-tokens swap)
- `update_price` — admin updates token price
- `deposit_revenue` — admin deposits period revenue
- `claim_revenue` — investor claims proportional share
- `pause_project` / `resume_project` — emergency stop
- `close_project` — cleanup and rent reclaim
- `add_to_whitelist` / `remove_from_whitelist` — KYC management
- `record_telemetry` — oracle pushes daily data hash

---

## 5. Off-chain Components

### Minimal Backend (Node.js / NestJS)

**Only what physically cannot be in a browser:**

- **Yandex Pro ingestion** — cron job: requests API with private credentials, computes SHA-256 hash, signs with oracle keypair, sends `record_telemetry` to Solana
- **KYC webhook** — one endpoint, receives approval from Sumsub; calls `add_to_whitelist` on-chain + Freeze Authority to thaw token account
- **Telemetry read endpoint** — `GET /telemetry/latest/:project_id` serves raw figures (revenue, mileage) for dashboard

**No database. No sessions. No business logic.**

### KYC Provider (Sumsub / Veriff)

External service handles identity verification entirely. Backend receives only webhook with result.

### Frontend (Next.js) as Primary State Source

Frontend reads everything directly from Solana:

- `getAccountInfo(ProjectState PDA)` — project status, parameters
- `getTokenAccountBalance` — token balance
- `getProgramAccounts` — all revenue periods, all claims for a wallet
- `getAccountInfo(WhitelistEntry PDA)` — KYC/whitelist status

---

## 6. Business Logic

### Token Sale (v2 model)

- Admin owns the asset and mints all tokens at initialization
- Tokens held in program-controlled vault
- Investors buy tokens at fixed `price_per_share` via `buy_tokens`
- On-chain validates: whitelist status, vault balance, project status
- Investors can transfer tokens peer-to-peer (subject to whitelist enforcement via transfer hook)

### Profit Formula

Profit = Revenue - Expenses - Reserve

### Payouts

- Admin calculates profit and calls `deposit_revenue` directly from frontend (admin panel)
- Investors claim independently by calling `claim_revenue`
- On-chain stores complete history of periods and claim records

### KYC / Whitelist Flow

1. Investor passes KYC via Sumsub (external form)
2. Sumsub calls `POST /kyc/webhook` on minimal backend
3. Backend calls `add_to_whitelist` and thaws token account
4. Investor can buy tokens

---

## 7. Frontend

- Car catalog (reads ProjectState PDAs via RPC)
- Asset page (reads ProjectState + telemetry)
- Buy tokens (preflight on client -> on-chain tx)
- Dashboard (tokens + RevenuePeriod PDAs + live telemetry)
- Payout history (ClaimRecord PDAs directly)
- Admin panel (sends admin instructions directly from browser)

---

## 8. Security

- Multisig — all privileged authorities (Upgrade, PermanentDelegate, TransferFee harvest, Freeze)
- Whitelist — enforced on-chain via Transfer Hook on every transfer
- Default Account State (Frozen) — protection until KYC
- Permanent Delegate — token seizure on violation
- Mint authority revoked — supply provably fixed forever
- Oracle keypair stored in secrets manager, inaccessible from browser
- KYC credentials (Sumsub API key) — only on minimal backend

---

## 9. MVP Constraints

- 1 vehicle
- Whitelist-only (KYC via Sumsub)
- Centralized oracle (backend keypair; not decentralized)
- Yandex Pro API as sole telemetry source
- No off-chain database — all state on-chain

---

## 10. Summary

On-chain (Solana):

- Token-2022 token with extensions
- axel program (all instructions)
- transfer-hook program (whitelist enforcement)
- All state: project, revenue periods, claims, whitelist, telemetry

Off-chain (Minimal Backend):

- Yandex Pro cron + oracle signing
- KYC webhook receiver (1 endpoint)
- Telemetry read endpoint (1 endpoint)

Blockchain is the only source of truth.
Backend exists only as a secure proxy for external APIs.
