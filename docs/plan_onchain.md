# On-chain Developer Plan — RWA Taxi Tokenization (v2: Direct Sale Model)

**Role:** ndrkbrg (On-chain) (Anchor/Rust, Token-2022, Transfer Hook)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-04-05

---

## Architecture Change (v2)

**v1 (Fundraising model):** Investors send SOL to escrow → admin finalizes raise → program mints tokens → refund if failed.

**v2 (Direct Sale model):** Admin already owns the asset. `initialize_project` creates the mint, mints all tokens to a program-controlled token vault, and revokes mint authority. Investors buy tokens at a fixed price via `buy_tokens` (atomic SOL-for-tokens swap). No escrow, no fundraise window, no refund.

**Why the change:** The fundraising model adds complexity (escrow, deadline, min_raise, finalize, refund) to protect against a scenario that doesn't apply — the admin already owns the car. Direct sale is simpler, more flexible, and closer to how real tokenized assets work.

**What stays the same:** Token-2022 mint with all 6 extensions, transfer hook whitelist enforcement, revenue distribution (deposit + claim), telemetry oracle, pause/resume.

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
  ├── token_vault: Pubkey             <- program-controlled ATA holding unsold tokens
  ├── revenue_vault: Pubkey           <- SOL for revenue distributions
  ├── token_supply: u64               <- total tokens minted (fixed forever)
  ├── price_per_share: u64            <- lamports per token (admin can update)
  ├── status: ProjectStatus           <- Active | Paused | Closed
  ├── period_count: u32
  ├── oracle_pubkey: Pubkey
  └── bump: u8

RevenuePeriod (PDA: ["revenue", project, period_index])
  ├── project: Pubkey
  ├── period_index: u32
  ├── total_deposited: u64            <- SOL deposited for this period
  ├── token_supply_snapshot: u64      <- total supply at time of deposit
  ├── deposited_at: i64
  └── bump: u8

ClaimRecord (PDA: ["claim", revenue_period, wallet])
  ├── claimed: bool                   <- prevents double-claim
  └── bump: u8

WhitelistEntry (PDA: ["whitelist", wallet])
  ├── approved: bool                  <- read by Transfer Hook on every transfer
  └── bump: u8

TelemetryRecord (PDA: ["telemetry", project, date_unix_day])
  ├── project: Pubkey
  ├── date: i64                        <- Unix timestamp (day-level granularity)
  ├── data_hash: [u8; 32]             <- SHA-256 of the full Yandex Pro payload
  ├── oracle_pubkey: Pubkey            <- backend oracle signing keypair
  ├── recorded_at: i64                <- block timestamp
  └── bump: u8
```

**Removed from v1:** `InvestorRecord` (token balances are the source of truth), `escrow_vault` (no escrow), `min_raise`/`max_raise`/`deadline`/`sol_raised` (no fundraising window).

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

**Business goal:** Admin creates the project, mints all tokens into a program-controlled vault, and revokes mint authority in a single instruction.

#### US-O05 — Initialize Project [NEEDS UPDATE]

> As the platform admin, I want to initialize a project, mint all tokens, and lock the supply so that investors can buy shares of a real asset.

**Status: NEEDS UPDATE** — current `initialize_project` creates the mint and ProjectState but does NOT mint tokens or revoke mint authority. Needs modification.

**Changes required:**

- Create a token vault ATA (program-controlled) for the project
- Thaw the vault ATA (DefaultAccountState is Frozen)
- Mint `token_supply` tokens to the vault ATA (using project_state PDA as mint authority)
- Revoke mint authority (set to None) — supply is now permanently fixed
- Remove: `escrow_vault`, `min_raise`, `max_raise`, `deadline`, `sol_raised` from ProjectState
- Add: `token_vault` to ProjectState
- Set status to `Active` (not `Fundraising`)

**Acceptance Criteria:**

- `initialize_project` creates mint with all 6 extensions
- All tokens minted to program-controlled vault ATA
- Mint authority revoked after minting (verifiable on Explorer)
- `ProjectState.status == Active`
- Token supply is fixed and provably capped

---

### Epic 4: Token Sale (NEW — replaces Fundraising)

**Business goal:** Investors buy tokens from the program vault at a fixed price. Atomic swap: SOL goes to admin, tokens go to investor.

#### US-O06v2 — Buy Tokens

> As a whitelisted investor, I want to buy tokens with SOL so that I own a share of the taxi asset.

**Status: NEW** — replaces old US-O06 (invest), US-O07 (finalize_raise), US-O08 (refund).

**Acceptance Criteria:**

- `buy_tokens` instruction accepts `token_amount: u64`
- Validates: investor is whitelisted, project status is `Active`, vault has enough tokens
- Calculates: `sol_cost = token_amount * price_per_share`
- Transfers SOL from investor wallet to admin wallet
- Transfers tokens from vault ATA to investor's ATA (thaws investor ATA first if frozen)
- Emits log: `{ event: "buy_tokens", wallet, token_amount, sol_cost }`
- No minimum/maximum per investor (or optional admin-set limits)

**Tests:**

1. Happy path — investor buys tokens, balances update correctly
2. Fails — non-whitelisted investor
3. Fails — vault has insufficient tokens
4. Fails — project is paused
5. Multiple buys accumulate correctly

---

#### US-O06v2b — Update Token Price (OPTIONAL)

> As the admin, I want to update the token price so that I can adjust to market conditions.

**Acceptance Criteria:**

- `update_price` instruction: admin-only, sets new `price_per_share`
- Emits log with old and new price

---

### Epic 5: Revenue Distribution (unchanged)

**Business goal:** Admin deposits SOL representing net profit; investors claim their proportional share based on token holdings.

#### US-O09 — Deposit Revenue

> As the platform admin, I want to deposit SOL into the revenue vault for a given period.

**Status: NOT STARTED**

**Acceptance Criteria:**

- `deposit_revenue` callable by admin only; project status must be `Active`
- Creates `RevenuePeriod` PDA with `period_index` (auto-incremented), `total_deposited`, `token_supply_snapshot`
- Transfers SOL from admin wallet to revenue vault
- `period_index` is sequential (validated against `ProjectState.period_count`)
- Emits `{ event: "deposit_revenue", period_index, total_deposited, token_supply_snapshot }`

---

#### US-O10 — Claim Revenue

> As an investor, I want to claim my SOL share of a revenue period.

**Status: NOT STARTED**

**Acceptance Criteria:**

- `claim_revenue` accepts `period_index`; callable by any token holder
- Validates: `ClaimRecord` PDA does not exist (prevents double-claim)
- Calculates: `payout = (investor_token_balance / period.token_supply_snapshot) * period.total_deposited`
- Transfers `payout` SOL from revenue vault to investor wallet
- Creates `ClaimRecord` PDA atomically with transfer
- Fails gracefully if investor held 0 tokens

---

### Epic 6: Project Lifecycle Management

#### US-O11 — Pause / Resume Project

> As the admin, I want to pause the project in case of emergency.

**Status: NOT STARTED**

**Acceptance Criteria:**

- `pause_project`: sets status to `Paused`; `buy_tokens`, `claim_revenue`, `deposit_revenue` all return `ProjectPaused`
- `resume_project`: sets status back to `Active`
- Both admin-only

---

#### US-O12 — Close Project

> As the admin, I want to close a finished project.

**Status: NOT STARTED**

**Acceptance Criteria:**

- `close_project`: validates all revenue periods fully claimed (or admin accepts remainder)
- Closes `ProjectState` PDA and vaults; reclaims rent

---

### Epic 7: Telemetry Oracle

#### US-O13 — Record Daily Telemetry

> As the backend oracle, I want to push daily Yandex Pro data hash to Solana.

**Status: NOT STARTED**

**Acceptance Criteria:**

- `record_telemetry`: creates `TelemetryRecord` PDA, validates oracle authority
- Idempotent for same day

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
| Anchor workspace + both programs | `programs/axel/`, `programs/transfer-hook/` | - |
| All state structs defined | `programs/axel/src/state/` | - |
| `initialize_project` (mint + 6 extensions + metadata) | `instructions/admin/initialize_project.rs` | `tests/initialize-project.test.ts` (4 tests) |
| Transfer hook `execute` + fallback + ExtraAccountMetaList | `programs/transfer-hook/src/lib.rs` | `tests/transfer-hook.test.ts` (2), `tests/transfer-hook-execute.test.ts` (3) |
| `add_to_whitelist` / `remove_from_whitelist` | `instructions/admin/whitelist.rs` | `tests/whitelist.test.ts` (4 tests) |
| `invest` (v1 — TO BE REMOVED) | `instructions/investor/invest.rs` | `tests/invest.test.ts` (6 tests) |

### NEEDS UPDATE (for v2)

| Item | What to change |
| --- | --- |
| `ProjectState` struct | Remove `escrow_vault`, `min_raise`, `max_raise`, `sol_raised`, `deadline`, `Fundraising`/`Finalized` statuses. Add `token_vault`. |
| `initialize_project` | After creating mint: create vault ATA, thaw it, mint all tokens to vault, revoke mint authority. Set status to `Active`. |
| Remove `InvestorRecord` state | Token balances are the source of truth — no need for this PDA. |
| Remove `invest` instruction | Replaced by `buy_tokens`. |

### TO BUILD (new)

| Item | Story | Priority |
| --- | --- | --- |
| `buy_tokens` instruction | US-O06v2 | Must Have |
| `update_price` instruction | US-O06v2b | Should Have |
| `deposit_revenue` instruction | US-O09 | Must Have |
| `claim_revenue` instruction | US-O10 | Must Have |
| `pause_project` / `resume_project` | US-O11 | Must Have |
| `record_telemetry` | US-O13 | Must Have |
| `close_project` | US-O12 | Should Have |
| `scripts/init-project.ts` seed script | — | Must Have |

### TO DELETE

| Item | Reason |
| --- | --- |
| `InvestorRecord` struct + state file | Not needed — token balance is the truth |
| `invest` instruction + handler | Replaced by `buy_tokens` |
| `tests/invest.test.ts` | Tests for removed instruction |
| `Fundraising` / `Finalized` enum variants | No fundraising in v2 |
| `escrow_vault` PDA logic | No escrow |

---

## Step-by-Step Implementation Plan

### Step 1: Update ProjectState and cleanup

1. Update `ProjectState` struct: remove fundraising fields, add `token_vault`
2. Simplify `ProjectStatus` enum: `Active`, `Paused`, `Closed`
3. Delete `InvestorRecord` struct and state file
4. Delete `invest` instruction and handler
5. Update `mod.rs` files to remove deleted modules
6. Update `lib.rs` to remove `invest` instruction

### Step 2: Update `initialize_project`

1. Remove fundraising params from `InitializeProjectParams` (deadline, min_raise)
2. Add vault ATA creation after mint init
3. Thaw the vault ATA (DefaultAccountState is Frozen)
4. Mint all tokens to vault ATA using PDA-signed CPI
5. Revoke mint authority (set to None)
6. Set status to `Active`
7. Update tests

### Step 3: Implement `buy_tokens`

1. Create `instructions/investor/buy_tokens.rs`
2. Atomic swap: investor SOL → admin, vault tokens → investor ATA
3. Thaw investor ATA if frozen (first purchase)
4. Write tests

### Step 4: Implement `deposit_revenue`

1. Create `instructions/admin/deposit_revenue.rs`
2. Create `RevenuePeriod` PDA, transfer SOL to revenue vault
3. Write tests

### Step 5: Implement `claim_revenue`

1. Create `instructions/investor/claim_revenue.rs`
2. Calculate proportional payout, create `ClaimRecord` atomically
3. Write tests

### Step 6: Implement `pause_project` / `resume_project`

1. Create `instructions/admin/pause_resume.rs`
2. Write tests

### Step 7: Implement `record_telemetry`

1. Create `instructions/oracle/record_telemetry.rs`
2. Write tests

### Step 8: Write `scripts/init-project.ts` seed script

---

## Phase Delivery Schedule

| Phase | Stories | Key Deliverable |
| --- | --- | --- |
| 1 (DONE) | US-O01, O02, O03, O04, O05 (partial), O14 | Anchor workspace, mint + extensions, transfer hook, whitelist |
| 2 (CURRENT) | US-O05 update, US-O06v2 | Updated initialize_project + buy_tokens |
| 3 | US-O09, O10 | Revenue deposit + claim |
| 4 | US-O11, O13 | Pause/resume + telemetry |
| 5 | US-O12, O15, O16 | Close project, multisig, security audit |

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
