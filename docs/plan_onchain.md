# On-chain Developer Plan — RWA Taxi Tokenization
**Role:** Dev B — On-chain / Solana (Anchor/Rust, Token-2022, Transfer Hook)
**Prepared by:** Product Owner / System Analyst
**Last updated:** 2026-03-28

---

## Product Context

The on-chain layer is the trust anchor of the entire platform. It enforces the rules of investment, ownership, and revenue distribution without any possibility of off-chain manipulation. All financial state — who owns how many tokens, how much SOL is in escrow, how much revenue has been deposited — must be provable on-chain.

**Two programs to build:**

| Program | Purpose |
| --- | --- |
| `rwa-taxi` | Main program: fundraising, investment, revenue deposit/claim, project lifecycle |
| `transfer-hook` | Token-2022 hook: enforces whitelist/KYC on every token transfer |

**Token standard:** Token-2022 (Token Extensions Program) — NOT the classic SPL Token program.

**Critical constraint:** All Token-2022 extensions must be configured **at mint initialization** — they cannot be added or changed later.

---

## North Star Metric

> Every SOL in the platform can be accounted for: either in the fundraising escrow vault, the revenue vault, or in an investor's wallet — with on-chain proof.

---

## On-chain Account Architecture

```
ProjectState (PDA: ["project", asset_id])
  ├── admin: Pubkey
  ├── mint: Pubkey                    ← Token-2022 mint
  ├── escrow_vault: Pubkey            ← SOL escrow during fundraising
  ├── revenue_vault: Pubkey           ← SOL for revenue distributions
  ├── token_supply: u64               ← car_cost_lamports / price_per_share
  ├── price_per_share: u64            ← lamports per token
  ├── min_raise: u64                  ← minimum SOL to finalize
  ├── max_raise: u64                  ← = token_supply × price_per_share
  ├── sol_raised: u64
  ├── deadline: i64                   ← Unix timestamp
  └── status: ProjectStatus           ← Fundraising | Finalized | Active | Paused | Closed

InvestorRecord (PDA: ["investor", project, wallet])
  ├── wallet: Pubkey
  ├── project: Pubkey
  ├── sol_invested: u64
  └── tokens_received: u64

RevenuePeriod (PDA: ["revenue", project, period_index])
  ├── project: Pubkey
  ├── period_index: u32
  ├── total_deposited: u64            ← SOL deposited for this period
  ├── token_supply_snapshot: u64      ← total supply at time of deposit
  └── deposited_at: i64

ClaimRecord (PDA: ["claim", revenue_period, wallet])
  └── claimed: bool                   ← prevents double-claim

WhitelistEntry (PDA: ["whitelist", wallet])
  └── approved: bool                  ← read by Transfer Hook on every transfer

TelemetryRecord (PDA: ["telemetry", project, date_unix_day])
  ├── project: Pubkey
  ├── date: i64                        ← Unix timestamp (day-level granularity)
  ├── data_hash: [u8; 32]              ← SHA-256 of the full Yandex Pro payload
  ├── oracle_pubkey: Pubkey            ← backend oracle signing keypair
  └── recorded_at: i64                ← block timestamp
```

---

## Epics & User Stories

---

### Epic 1: Token-2022 Mint Setup

**Business goal:** Create a Token-2022 mint with all required extensions configured at initialization. This is the highest-risk step — once created, extensions are immutable.

#### US-O01 — Initialize Token-2022 Mint
> As the platform, I want to create a Token-2022 mint with the correct extensions so that all token behavior is enforced at the protocol level.

**Acceptance Criteria:**
- Mint created using Token-2022 program (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`)
- The following extensions are initialized **in this exact order** (Token-2022 requires ordered initialization):
  1. `TransferHook` — points to the `transfer-hook` program ID
  2. `DefaultAccountState(Frozen)` — all new token accounts start frozen
  3. `PermanentDelegate` — set to multisig authority
  4. `TransferFee` — e.g., 100 basis points (1%), harvest authority = multisig
  5. `MetadataPointer` — points to mint itself
  6. `TokenMetadata` — stores car VIN, make, model, year, valuation
- `MemoTransfer` enabled on all investor token accounts (account-level extension, set on ATA creation)
- Mint authority held by the `rwa-taxi` program PDA (not a hot key)
- Freeze authority held by the multisig
- After token supply is fully minted (`finalize_raise`), mint authority is revoked

**Priority:** Must Have | **Phase:** 1 (design) / 2 (implementation)

---

#### US-O02 — Token Metadata
> As the frontend, I want car metadata stored on-chain in the mint so that asset details are verifiable without trusting the backend.

**Acceptance Criteria:**
- Metadata stored in `TokenMetadata` extension: `name`, `symbol`, `uri` (points to off-chain JSON), plus additional fields: `vin`, `make`, `model`, `year`, `valuation_sol`
- Metadata can be updated by metadata update authority (multisig) before tokens are minted
- Once `finalize_raise` executes and mint authority is revoked, metadata is frozen

**Priority:** Must Have | **Phase:** 2

---

### Epic 2: Transfer Hook Program

**Business goal:** Enforce whitelist/KYC compliance on every token transfer at the protocol level — transfers to or from non-whitelisted wallets must fail automatically.

#### US-O03 — Transfer Hook: Whitelist Enforcement
> As the platform, I want every token transfer to automatically verify that both the sender and receiver are whitelisted so that non-KYC'd wallets can never receive or send tokens.

**Acceptance Criteria:**
- `transfer-hook` program implements the `execute` instruction as required by the Token-2022 `TransferHook` interface
- `execute` verifies that its caller is the Token-2022 program (not callable directly)
- Checks `WhitelistEntry` PDA for both `source_owner` and `destination_owner`
- If either PDA does not exist or `approved = false`, instruction returns `Unauthorized` error — the transfer fails
- Exception: transfers FROM the program's `rwa-taxi` PDA (minting) bypass the whitelist check
- All extra accounts required by the hook are registered in `ExtraAccountMetaList` PDA
- Anchor tests: whitelist-to-whitelist transfer succeeds; non-whitelisted receiver fails; non-whitelisted sender fails; mint (program authority) to investor succeeds

**Priority:** Must Have | **Phase:** 2

---

#### US-O04 — Whitelist PDA Management
> As the backend, I want to add and remove wallets from the whitelist PDA so that KYC approvals and revocations are reflected on-chain.

**Acceptance Criteria:**
- `add_to_whitelist` instruction: creates `WhitelistEntry` PDA with `approved = true`; authority check: only the program admin or multisig can call
- `remove_from_whitelist` instruction: sets `approved = false` (does not close PDA — maintains audit trail)
- Both instructions emit program log events parseable by the backend event indexer
- Backend calls these instructions via CPI or direct transaction (coordinate with Dev C)

**Priority:** Must Have | **Phase:** 2

---

### Epic 3: Fundraising Program

**Business goal:** Run a time-limited fundraise where investors send SOL to an escrow vault and receive Token-2022 tokens proportional to their investment.

#### US-O05 — Initialize Project
> As the platform admin, I want to initialize an on-chain project so that fundraising parameters are locked in immutably.

**Acceptance Criteria:**
- `initialize_project` creates `ProjectState` PDA with all fundraising parameters
- Parameters set at init and immutable: `token_supply`, `price_per_share`, `min_raise`, `max_raise`, `deadline`
- `token_supply` is derived from `car_cost_lamports / price_per_share` (validated: no remainder)
- Creates SOL escrow vault (system program account owned by PDA)
- Creates revenue vault (system program account owned by PDA)
- Project status set to `Fundraising`
- Only callable by admin authority (multisig)

**Priority:** Must Have | **Phase:** 2

---

#### US-O06 — Investor Contribution
> As a whitelisted investor, I want to send SOL to the project escrow so that I can receive tokens representing my ownership share.

**Acceptance Criteria:**
- `invest` instruction accepts `amount_lamports`
- Validates: project status is `Fundraising`; deadline not passed; investor is in whitelist
- Validates: `amount_lamports` ≥ min investment per investor; investor total does not exceed max per investor
- Transfers SOL from investor wallet to escrow vault via system program
- Creates or updates `InvestorRecord` PDA (atomic with SOL transfer)
- Does NOT mint tokens yet — tokens are minted on `finalize_raise`
- Emits structured log event: `{ event: "invest", wallet, amount_lamports, total_invested }`

**Priority:** Must Have | **Phase:** 2

---

#### US-O07 — Finalize Fundraise
> As the platform, I want to finalize the raise and mint tokens to investors so that ownership is established on-chain.

**Acceptance Criteria:**
- `finalize_raise` callable by admin only; validates `sol_raised >= min_raise`
- Mints `InvestorRecord.tokens_received = sol_invested / price_per_share` tokens to each investor's ATA
- Because `DefaultAccountState` is `Frozen`, minted tokens land in frozen accounts — cannot be transferred until Freeze Authority unfreezes (triggered by backend after KYC flow)
- Revokes mint authority after full supply is distributed (calls `setAuthority` to `None`)
- Project status transitions to `Active`
- Emits `{ event: "finalize_raise", total_raised, tokens_minted }`

**Priority:** Must Have | **Phase:** 2

---

#### US-O08 — Refund
> As an investor, I want to reclaim my SOL if the fundraise fails so that my capital is not locked indefinitely.

**Acceptance Criteria:**
- `refund` callable by any investor after `deadline` has passed AND `sol_raised < min_raise`
- Uses `PermanentDelegate` to burn investor's tokens if any were provisionally minted
- Returns investor's `sol_invested` from escrow vault to investor wallet
- Closes `InvestorRecord` PDA; reclaims rent to admin
- Not callable if project status is `Active` (raise was successful)
- Emits `{ event: "refund", wallet, amount_lamports }`

**Priority:** Must Have | **Phase:** 2

---

### Epic 4: Revenue Distribution

**Business goal:** Admin deposits SOL representing net profit into the revenue vault; investors call claim to receive their proportional share.

#### US-O09 — Deposit Revenue
> As the platform admin, I want to deposit SOL into the revenue vault for a given period so that investors can claim their share.

**Acceptance Criteria:**
- `deposit_revenue` callable by admin only; project status must be `Active`
- Creates `RevenuePeriod` PDA with `period_index` (auto-incremented), `total_deposited`, `token_supply_snapshot` (reads current total supply from mint)
- Transfers SOL from admin wallet to revenue vault
- `period_index` is sequential — no gaps allowed (validated against `ProjectState.period_count`)
- Emits `{ event: "deposit_revenue", period_index, total_deposited, token_supply_snapshot }`

**Priority:** Must Have | **Phase:** 2

---

#### US-O10 — Claim Revenue
> As an investor, I want to claim my SOL share of a revenue period so that I receive my earnings.

**Acceptance Criteria:**
- `claim_revenue` accepts `period_index`; callable by any token holder
- Validates: `ClaimRecord` PDA for this `(period, wallet)` does not exist (prevents double-claim)
- Calculates: `payout = (investor_token_balance / period.token_supply_snapshot) × period.total_deposited`
- Transfers `payout` SOL from revenue vault to investor wallet
- Creates `ClaimRecord` PDA with `claimed = true` (atomic with transfer — same transaction)
- Emits `{ event: "claim_revenue", wallet, period_index, amount_lamports }`
- Fails gracefully if investor held 0 tokens at snapshot time (no tokens → no claim)

**Priority:** Must Have | **Phase:** 2

---

### Epic 5: Project Lifecycle Management

#### US-O11 — Pause Project
> As the platform admin, I want to pause the project in case of an emergency so that no new investments or claims are processed until the issue is resolved.

**Acceptance Criteria:**
- `pause_project` callable by multisig only; sets `ProjectState.status = Paused`
- While paused: `invest`, `claim_revenue`, `deposit_revenue` all return `ProjectPaused` error
- `refund` is still allowed while paused (investor safety)
- `resume_project` instruction un-pauses; also multisig only
- Emits `{ event: "pause_project" }` and `{ event: "resume_project" }`

**Priority:** Must Have | **Phase:** 2

---

#### US-O12 — Close Project
> As the platform admin, I want to close a finished project so that all accounts are cleaned up and rent is reclaimed.

**Acceptance Criteria:**
- `close_project` callable by multisig only; validates all revenue periods are fully claimed (or admin accepts remaining unclaimed balance)
- Closes `ProjectState` PDA and vaults; reclaims rent to admin
- Emits `{ event: "close_project" }`

**Priority:** Should Have | **Phase:** 3

---

### Epic 6: Telemetry Oracle

**Business goal:** Create an immutable on-chain proof that real-world taxi data was recorded by an authorized oracle — connecting the physical asset to the blockchain and making it verifiable by any investor.

#### US-O13 — Record Daily Telemetry

> As the backend oracle, I want to push a daily signed hash of Yandex Pro data to Solana so that investors can independently verify that reported earnings are backed by real operator data.

**Acceptance Criteria:**

- New instruction `record_telemetry` added to the `rwa-taxi` program
- Accepts: `date` (Unix day timestamp), `data_hash` ([u8; 32] — SHA-256 of the full Yandex Pro JSON payload)
- Creates `TelemetryRecord` PDA with seeds `["telemetry", project, date]` — one record per project per day
- Authority check: caller must be the registered `oracle_pubkey` stored in `ProjectState` (set during `initialize_project`)
- Instruction is idempotent for the same day: second call with same date returns success without overwriting (prevents replay)
- Emits structured log: `{ event: "record_telemetry", date, data_hash, oracle_pubkey }`
- Anchor test: valid oracle can record; non-oracle authority rejected; duplicate date rejected; data_hash stored correctly

**Priority:** Must Have | **Phase:** 2

---

#### US-O14 — Oracle Pubkey Registration

> As the platform admin, I want to register the oracle public key during project initialization so that only the authorized backend can push telemetry data.

**Acceptance Criteria:**

- `initialize_project` accepts an `oracle_pubkey: Pubkey` parameter; stored in `ProjectState`
- `oracle_pubkey` can be rotated by multisig via a new `update_oracle` instruction (for key rotation without redeploying)
- `update_oracle` emits `{ event: "oracle_updated", old_pubkey, new_pubkey }`

**Priority:** Must Have | **Phase:** 2

---

### Epic 7: Developer SDK & Tooling

**Business goal:** Provide a TypeScript SDK so that Dev A (frontend) and Dev C (backend) can interact with the program without writing low-level Anchor client code.

#### US-O13 — RwaClient SDK
> As a frontend and backend developer, I want a TypeScript SDK wrapper so that I can call program instructions without managing raw transactions.

**Acceptance Criteria:**
- Exported class `RwaClient` with methods:
  - `invest(projectId, amountLamports, wallet)` → `TransactionSignature`
  - `claimRevenue(projectId, periodIndex, wallet)` → `TransactionSignature`
  - `getProjectState(projectId)` → `ProjectState`
  - `getInvestorRecord(projectId, wallet)` → `InvestorRecord`
  - `harvestTransferFees(mint, destination, authority)` → `TransactionSignature`
  - `unfreezeAccount(tokenAccount, authority)` → `TransactionSignature`
- All methods automatically attach ComputeBudget instructions with simulated CU + 20% buffer
- All methods accept an optional `commitment` parameter
- Versioned alongside IDL — breaking changes bump minor version

**Priority:** Should Have | **Phase:** 4

---

### Epic 7: Security & Authority Management

#### US-O14 — Multisig Authority Setup
> As the platform operator, I want all privileged authorities held by a Squads multisig so that no single key controls the program.

**Acceptance Criteria:**
- Upgrade authority on both programs (`rwa-taxi`, `transfer-hook`) set to Squads multisig
- `PermanentDelegate` authority = multisig
- `TransferFee` harvest authority = multisig
- Freeze Authority = multisig
- Original deployment keypairs removed from hot storage after setup
- Document: multisig address, member keys, threshold (M-of-N)

**Priority:** Must Have | **Phase:** 3 (setup) / 6 (verified)

---

#### US-O15 — Security Audit
> As the platform, I want a pre-launch security review of all on-chain logic so that no exploitable vulnerabilities go to mainnet.

**Acceptance Criteria:**
- [ ] All authority checks use `has_one` or `constraint` — no unchecked `Pubkey` comparisons
- [ ] All arithmetic uses `checked_add`, `checked_mul`, `checked_div` — no overflow possible
- [ ] `claim_revenue` creates `ClaimRecord` atomically in the same tx as the SOL transfer
- [ ] `deposit_revenue` `period_index` is sequential — no period can be skipped or replayed
- [ ] Transfer Hook `execute` validates its caller is the Token-2022 program
- [ ] Whitelist PDA seeds are deterministic and cannot be spoofed by a crafted PDA
- [ ] `PermanentDelegate` authority is the multisig, not the program itself
- [ ] `pause_project` correctly returns `ProjectPaused` for all financial instructions
- [ ] `cargo clippy` passes with zero warnings
- [ ] All test scenarios pass on devnet release build

**Priority:** Must Have | **Phase:** 5

---

## Phase Delivery Schedule

| Phase | Days | Stories | Key Deliverable |
| --- | --- | --- | --- |
| 1 | 1–5 | US-O01 (design) | Anchor workspace + `transfer-hook` program scaffolded; account structs defined; IDL stub exported; extension plan agreed |
| 2 | 6–12 | US-O01–O12 | All instructions + Transfer Hook implemented; full test suite on devnet |
| 3 | 13–18 | US-O12, US-O14 | Integration test scenario; final IDL frozen; multisig authority set; PDA docs |
| 4 | 19–23 | US-O13 | `RwaClient` SDK; devnet seed script; pause/close verified |
| 5 | 24–29 | US-O15 | Security audit checklist complete; release build on devnet; mainnet checklist |
| 6 | 30–34 | — | Deployment artifact; emergency runbook; final program ID confirmed |

---

## Outputs Consumed by Other Developers

| Output | Consumer | Needed By |
| --- | --- | --- |
| IDL JSON (stable) | Dev A (Frontend), Dev C (Backend) | Phase 3 start |
| IDL JSON (frozen) | Dev A (Frontend), Dev C (Backend) | Phase 3 end |
| Whitelist PDA seeds + instruction signature | Dev C (Backend) | Phase 2 |
| `ExtraAccountMetaList` PDA address for Transfer Hook | Dev C (Backend) | Phase 2 |
| On-chain log event format (invest, refund, etc.) | Dev C (Backend) | Phase 2 |
| Freeze Authority (multisig or intermediary) API | Dev C (Backend) | Phase 2 |
| `RwaClient` SDK npm package | Dev A (Frontend), Dev C (Backend) | Phase 4 |
| Final program ID | Dev A (Frontend), Dev C (Backend) | Phase 6 |

---

## Definition of Done

A user story is complete when:

- [ ] Instruction compiles and deploys to devnet
- [ ] Anchor test covers: happy path, authority failure, wrong-state failure, arithmetic edge case
- [ ] Emits correct structured log event parseable by Dev C's indexer
- [ ] `cargo clippy` passes with zero warnings for the instruction
- [ ] Documented in the PDA reference doc (seeds, size, account fields)
- [ ] Reviewed by one other team member
