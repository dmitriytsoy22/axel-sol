# On-chain Developer Plan — RWA Taxi Tokenization (v2: Direct Sale Model)

**Role:** ndrkbrg (On-chain) (Anchor/Rust, Token-2022, Transfer Hook)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-04-05 (post-implementation refresh)

---

## Architecture (v2 — Direct Sale, Mint-on-Demand)

**Model:** Admin already owns the asset. `initialize_project` creates the Token-2022 mint with 0 tokens in circulation. Investors buy tokens at a fixed price via `buy_tokens` — tokens are minted directly to the investor's ATA at purchase time (mint-on-demand). After all tokens are sold, admin calls `revoke_mint_authority` to permanently lock the supply.

**Why mint-on-demand (not pre-minted vault):**

- A pre-minted vault would require transfers from vault → investor on every purchase, triggering the transfer hook and requiring whitelist PDAs for both the vault owner (project_state PDA) and the investor as extra accounts.
- Mint-on-demand bypasses the transfer hook entirely (minting is not a transfer).
- The `token_supply` field on ProjectState caps the maximum; `tokens_sold` tracks what has been minted; the revoke instruction finalizes the cap.

**Why direct sale (not fundraising):** The admin already owns the car. No escrow, deadline, min_raise, finalize, or refund logic is needed.

**What stays the same from classical token designs:** Token-2022 mint with all 6 extensions, transfer hook whitelist enforcement, revenue distribution (deposit + claim), telemetry oracle, pause/resume.

---

## Product Context

The on-chain layer is the trust anchor of the entire platform. It enforces the rules of ownership and revenue distribution without any possibility of off-chain manipulation. All financial state — who owns how many tokens, how much revenue has been deposited — must be provable on-chain.

**Two programs:**

| Program | Purpose |
| --- | --- |
| `axel` | Main program: token sale, revenue deposit/claim, project lifecycle |
| `transfer-hook` | Token-2022 hook: enforces whitelist/KYC on every token transfer |

**Token standard:** Token-2022 (Token Extensions Program) — NOT the classic SPL Token program.

**Critical constraint:** All Token-2022 extensions must be configured **at mint initialization** — they cannot be added or changed later.

---

## North Star Metric

> Every token is backed by a real asset. Token supply is fixed and provably capped (mint authority revoked). Revenue distribution is proportional and verifiable on-chain.

---

## On-chain Account Architecture

```
ProjectState (PDA: ["project", mint])
  ├── admin: Pubkey
  ├── mint: Pubkey                    <- Token-2022 mint
  ├── revenue_vault: Pubkey           <- SOL vault for revenue distributions
  ├── token_supply: u64               <- max tokens that can ever be minted
  ├── tokens_sold: u64                <- tokens actually minted so far
  ├── price_per_share: u64            <- lamports per token
  ├── status: ProjectStatus           <- Active | Paused | Closed
  ├── period_count: u32               <- revenue periods deposited so far
  ├── oracle_pubkey: Pubkey
  ├── bump: u8
  └── revenue_vault_bump: u8          <- stored so claim_revenue can sign as the vault PDA

RevenueVault (system-owned PDA, SOL only, no data)
  seeds = ["revenue", mint]

RevenuePeriod (PDA: ["revenue_period", mint, period_index_le])
  ├── project: Pubkey                 <- mint
  ├── period_index: u32
  ├── total_deposited: u64
  ├── token_supply_snapshot: u64      <- tokens_sold at time of deposit
  ├── deposited_at: i64
  └── bump: u8

ClaimRecord (PDA: ["claim", revenue_period, wallet])
  ├── claimed: bool                   <- existence prevents double-claim
  └── bump: u8

WhitelistEntry (PDA: ["whitelist", wallet])
  ├── approved: bool
  └── bump: u8

TelemetryRecord (PDA: ["telemetry", mint, date_le])
  ├── project: Pubkey                 <- mint
  ├── date: u32                        <- YYYYMMDD integer (e.g. 20260405)
  ├── data_hash: [u8; 32]             <- SHA-256 of the Yandex Pro payload
  ├── oracle_pubkey: Pubkey
  ├── recorded_at: i64
  └── bump: u8
```

**Not present:** `InvestorRecord` (token balances are the source of truth), `token_vault` / `escrow_vault` (mint-on-demand, no pre-minted supply), `min_raise` / `max_raise` / `deadline` (no fundraising window).

---

## Epics & User Stories

---

### Epic 1: Token-2022 Mint Setup

**Business goal:** Create a Token-2022 mint with all required extensions, mint all tokens to admin, and revoke mint authority — proving the supply is fixed forever.

#### US-O01 — Initialize Token-2022 Mint [DONE]

> As the platform, I want to create a Token-2022 mint with the correct extensions so that all token behavior is enforced at the protocol level.

**Status: DONE** — implemented and tested.

**Acceptance Criteria:**

- Mint created using Token-2022 program
- Extensions initialized in order: TransferHook, DefaultAccountState(Frozen), PermanentDelegate, TransferFee(100bps), MetadataPointer, TokenMetadata
- Mint authority held by `project_state` PDA
- Freeze authority held by admin (multisig in prod)

---

#### US-O02 — Token Metadata [DONE]

> As the frontend, I want car metadata stored on-chain in the mint so that asset details are verifiable without trusting the backend.

**Status: DONE** — metadata (name, symbol, uri, vin, make, model, year, valuation_sol) written in `initialize_project`.

---

### Epic 2: Transfer Hook Program

**Business goal:** Enforce whitelist/KYC compliance on every token transfer at the protocol level.

#### US-O03 — Transfer Hook: Whitelist Enforcement [DONE]

> As the platform, I want every token transfer to automatically verify that both the sender and receiver are whitelisted.

**Status: DONE** — `execute` instruction implemented with fallback routing, ExtraAccountMetaList PDA, integration tests passing.

---

#### US-O04 — Whitelist PDA Management [DONE]

> As the backend, I want to add and remove wallets from the whitelist PDA.

**Status: DONE** — `add_to_whitelist` (idempotent via `init_if_needed`), `remove_from_whitelist` implemented and tested.

---

### Epic 3: Project Initialization (v2)

**Business goal:** Admin creates the project and the Token-2022 mint in a single instruction. No tokens are minted yet — they are minted on demand during `buy_tokens`.

#### US-O05 — Initialize Project [DONE]

> As the platform admin, I want to initialize a project and create its mint so that investors can buy shares.

**Status: DONE**

- Creates Token-2022 mint with 6 extensions (TransferHook, DefaultAccountState Frozen, PermanentDelegate, TransferFee 100bps, MetadataPointer, TokenMetadata)
- `mint_authority = freeze_authority = project_state PDA` (program signs mints and thaws)
- Writes ProjectState with `tokens_sold = 0`, `status = Active`, `revenue_vault_bump` stored
- No tokens minted yet — mint-on-demand model

---

### Epic 4: Token Sale

**Business goal:** Investors buy tokens at a fixed price. Atomic swap: SOL goes to admin, tokens are minted directly to the investor's ATA.

#### US-O06v2 — Buy Tokens [DONE]

> As a whitelisted investor, I want to buy tokens with SOL so that I own a share of the taxi asset.

**Status: DONE**

- Validates: investor whitelisted, project Active, `token_amount > 0`, remaining supply sufficient
- Transfers SOL from investor → admin
- Creates investor ATA via Associated Token Program if it doesn't exist, then thaws it (program signs as freeze_authority)
- Mints `token_amount` tokens directly to the investor's ATA (program signs as mint_authority)
- Increments `tokens_sold`

#### US-O06c — Revoke Mint Authority [DONE]

> As the admin, I want to permanently lock the supply after all tokens have been sold.

**Status: DONE**

- Admin-only instruction
- Requires `tokens_sold == token_supply` to prevent stranding unsold tokens
- CPI to Token-2022 `set_authority` with `AuthorityType::MintTokens`, `new_authority = None`
- After this call, no tokens can ever be minted for this mint — supply is cryptographically fixed

---

#### US-O06v2b — Update Token Price [DONE]

> As the admin, I want to update the token price so that I can adjust to market conditions.

**Status: DONE**

- Admin-only (`has_one = admin`); project must be Active
- Validates new price > 0 (`ZeroPricePerShare`)
- Updates `price_per_share` on `ProjectState`
- Emits log with old and new price

---

### Epic 5: Revenue Distribution (unchanged)

**Business goal:** Admin deposits SOL representing net profit; investors claim their proportional share based on token holdings.

#### US-O09 — Deposit Revenue [DONE]

> As the platform admin, I want to deposit SOL into the revenue vault for a given period.

**Status: DONE**

- Admin-only; project must be Active; `tokens_sold > 0`
- Validates `period_index == project_state.period_count` (strict sequential, no skipping)
- Transfers SOL from admin → revenue_vault PDA
- Creates `RevenuePeriod` PDA with snapshot of `tokens_sold` (tokens in circulation at deposit time)
- Increments `period_count`

---

#### US-O10 — Claim Revenue [DONE]

> As an investor, I want to claim my SOL share of a revenue period.

**Status: DONE**

- Callable by any token holder; project must be Active
- Reads investor's token balance directly from their Token-2022 ATA (validated: correct mint + correct owner)
- Payout formula: `(balance * total_deposited) / token_supply_snapshot` in u128 to avoid overflow
- Transfers SOL from revenue_vault PDA to investor via `invoke_signed` using vault's seeds (`["revenue", mint]`)
- Creates `ClaimRecord` PDA seeded by `["claim", revenue_period, investor]` — `init` constraint prevents double-claim

---

### Epic 6: Project Lifecycle Management

#### US-O11 — Pause / Resume Project [DONE]

> As the admin, I want to pause the project in case of emergency.

**Status: DONE**

- `pause_project`: requires Active, sets status to `Paused`
- `resume_project`: requires Paused, sets status to `Active`
- Both admin-only via `has_one = admin`
- While paused, `buy_tokens`, `deposit_revenue`, `claim_revenue` all fail with `ProjectNotActive`

---

#### US-O12 — Close Project [DONE]

> As the admin, I want to close a finished project.

**Status: DONE**

- Admin-only (`has_one = admin`); project must not already be Closed (works from Active or Paused)
- Drains all remaining SOL from revenue vault to admin via `invoke_signed` with vault PDA seeds
- Sets status to `Closed` — all operations (`buy_tokens`, `deposit_revenue`, `claim_revenue`) blocked
- `ProjectState` PDA remains readable (not deleted) for historical reference

---

### Epic 7: Telemetry Oracle

#### US-O13 — Record Daily Telemetry [DONE]

> As the backend oracle, I want to push daily Yandex Pro data hash to Solana.

**Status: DONE**

- Oracle-only: signer must equal `project_state.oracle_pubkey`
- Project must be Active
- Creates `TelemetryRecord` PDA seeded by `["telemetry", mint, date]` where `date` is a `u32` like `20260405`
- Stores: project mint, date, 32-byte SHA-256 data hash, oracle pubkey, recorded_at
- Idempotent per day: duplicate calls fail because the PDA already exists

---

#### US-O14 — Oracle Pubkey Registration [DONE]

> As the admin, I want to register the oracle public key during project initialization.

**Status: DONE** — `oracle_pubkey` is a field on `ProjectState`, set during `initialize_project`.

---

### Epic 8: Security & Authority Management (later phases)

#### US-O15 — Multisig Authority Setup

- Upgrade authority on both programs set to Squads multisig
- All privileged authorities (PermanentDelegate, TransferFee harvest, Freeze) held by multisig

#### US-O16 — Security Audit

- All authority checks, arithmetic safety, atomicity guarantees reviewed

---

## Implementation Status

### DONE

| Item | Files | Tests |
| --- | --- | --- |
| Anchor workspace + both programs | `programs/axel/`, `programs/transfer-hook/` | — |
| All state structs (no `InvestorRecord`) | `programs/axel/src/state/` | — |
| `initialize_project` (mint + 6 extensions + metadata, v2) | `instructions/admin/initialize_project.rs` | `tests/initialize-project.test.ts` |
| Transfer hook `execute` + fallback + ExtraAccountMetaList | `programs/transfer-hook/src/lib.rs` | `tests/transfer-hook.test.ts`, `tests/transfer-hook-execute.test.ts` |
| `add_to_whitelist` (idempotent) / `remove_from_whitelist` | `instructions/admin/whitelist.rs` | `tests/whitelist.test.ts` |
| `buy_tokens` (mint-on-demand) | `instructions/investor/buy_tokens.rs` | `tests/buy-tokens.test.ts` |
| `deposit_revenue` | `instructions/admin/deposit_revenue.rs` | `tests/deposit-revenue.test.ts` |
| `claim_revenue` | `instructions/investor/claim_revenue.rs` | `tests/claim-revenue.test.ts` |
| `pause_project` / `resume_project` | `instructions/admin/pause_resume.rs` | `tests/pause-resume.test.ts` |
| `record_telemetry` (oracle) | `instructions/oracle/record_telemetry.rs` | `tests/record-telemetry.test.ts` |
| `revoke_mint_authority` | `instructions/admin/revoke_mint_authority.rs` | `tests/revoke-mint-authority.test.ts` |
| `update_price` | `instructions/admin/update_price.rs` | `tests/update-price.test.ts` |
| `close_project` | `instructions/admin/close_project.rs` | `tests/close-project.test.ts` |
| Seed script | `scripts/init-project.ts` | — |

### TO BUILD

| Item | Story | Priority |
| --- | --- | --- |
| Multisig (Squads) authority migration | US-O15 | Later (pre-mainnet) |
| Security audit | US-O16 | Later (pre-mainnet) |

---

## Phase Delivery Schedule

| Phase | Stories | Status |
| --- | --- | --- |
| 1 | US-O01, O02, O03, O04, O14 | DONE |
| 2 | US-O05, US-O06v2, US-O06c (revoke) | DONE |
| 3 | US-O09, O10 | DONE |
| 4 | US-O11, O13 | DONE |
| 5a | US-O06v2b, O12 | DONE |
| 5b | O15, O16 | TODO (pre-mainnet) |

---

## Outputs Consumed by Other Developers

| Output | Consumer | Needed By |
| --- | --- | --- |
| IDL JSON (stable) | dimagonedone, russh | Phase 2 |
| Whitelist PDA seeds + instruction signature | russh | Phase 1 (DONE) |
| `buy_tokens` instruction signature | dimagonedone | Phase 2 |
| Revenue distribution instructions | dimagonedone | Phase 3 |
| `record_telemetry` instruction | russh | Phase 4 |
| Final program IDs | dimagonedone, russh | Phase 5 |

---

## Definition of Done

A user story is complete when:

- [ ] Instruction compiles and deploys to devnet
- [ ] Anchor test covers: happy path, authority failure, wrong-state failure, edge cases
- [ ] Emits correct structured log event
- [ ] `cargo clippy` passes with zero warnings
- [ ] Documented in PDA reference doc
