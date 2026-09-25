# Planning Documents (historical)

These documents were written between 2026-03-28 and 2026-04-06, before and during the first implementation. They record the plan, not the result. Some parts were dropped or changed along the way.

For the system as built, read [../architecture.md](../architecture.md), [../v2.md](../v2.md) and [../api.md](../api.md).

| File | What it is |
|---|---|
| [rwa_taxi_tokenization_spec.md](rwa_taxi_tokenization_spec.md) | Technical specification, "v2 — Direct Sale" business model (the spec's own version number; it describes what became the v1 programs, not `axel_v2`) |
| [development_plan.md](development_plan.md) | Six-phase team plan with dependencies |
| [plan_onchain.md](plan_onchain.md) | On-chain user stories US-O01..O15 (refreshed 2026-04-05) |
| [plan_backend.md](plan_backend.md) | Backend user stories US-B01..B04 (refreshed 2026-04-06) |
| [plan_frontend.md](plan_frontend.md) | Frontend user stories US-F01..F13 (dated 2026-03-28) |

The Russian project overview, [../ru/project-overview.md](../ru/project-overview.md), and the pre-hackathon frontend task and prompt lists in [../ru/](../ru/) are kept for the team. The English description of the system is [../architecture.md](../architecture.md).

## Where the plans differ from the code

The plans describe what became v1. The second column says what the v1 code does; the third, what `axel_v2` and the current backend and frontend do.

| Claim in the plans / overview | v1 code | v2 |
|---|---|---|
| Fundraising flow: `start_raise`, `invest`, `finalize`, `refund`, escrow vault, min/max raise, deadline, `InvestorRecord`, "SOL raised", investor count (`development_plan.md`, `plan_frontend.md`) | Direct sale only. `buy_tokens` sends SOL straight to the admin. Statuses are Active / Paused / Closed. There is no escrow, refund or `InvestorRecord`. | Escrowed raise in a stablecoin with a soft cap, a deadline and exact refunds; `Position` per holder; six states ([../v2.md](../v2.md#state-machine)) |
| `initialize_project` mints the whole supply up front (to a vault, or to the admin) and revokes the mint authority (spec §4, `development_plan.md`, Epic 1 business goal in `plan_onchain.md`) | Nothing is minted at creation. Shares are minted to the buyer inside `buy_tokens`. `revoke_mint_authority` is a separate instruction, allowed only after every share is sold. | Shares are minted to the buyer in `buy_shares` during the raise only; afterwards the program mints only as many as a recovery burns, so the supply is fixed |
| Memo Transfer extension (spec §4, `development_plan.md`) | Not enabled. The mint has six extensions: TransferHook, DefaultAccountState, PermanentDelegate, TransferFeeConfig, MetadataPointer, TokenMetadata. | Not enabled. Five extensions; TransferFeeConfig was dropped |
| 1% transfer fee "accumulates in reserve fund" (spec §4) | Fees are withheld in recipients' token accounts. No instruction or UI collects them. | No transfer fee; platform fees on the raise and on revenue go to the treasury |
| KYC webhook whitelists **and thaws** the token account (spec §5–6) | The webhook only calls `add_to_whitelist`. Thawing happens inside `buy_tokens`. | The webhook writes an `Investor` record with `set_investor`; `buy_shares`, `open_position` and `execute_recovery` thaw the owner's canonical account |
| KYC through Sumsub in the UI (spec §5–6) | The backend webhook is Sumsub-shaped. The frontend `KycPrompt` links to Blockpass, and no page mounts it. | The backend has wallet sign-in and Sumsub sessions; the web app does not start the Sumsub flow yet |
| Whitelist changes are admin actions (`ru/project-overview.md` admin instruction table, `plan_frontend.md` admin model) | `add_to_whitelist` / `remove_from_whitelist` accept any signer. | Only the KYC key (or the scoped demo KYC key) can write `Investor` records |
| Multisig (Squads) for upgrade and privileged authorities (spec §8, `development_plan.md`, US-O15) | Not configured. US-O15 itself is marked post-MVP. Authorities are single keys. | Still single keys; Squads is a documented mainnet requirement ([../../programs/axel-v2/README.md](../../programs/axel-v2/README.md#mainnet-requirements)) |
| Sign-In with Solana (SIWS) (`plan_frontend.md`, `plan_backend.md`, `development_plan.md`) | Not implemented. The admin panel compares the connected wallet with `ProjectState.admin`. | The backend's KYC sign-in (`GET /kyc/nonce`, `POST /kyc/session`) and the demo access route use signed messages; the console reads roles from the chain |
| Sentry, Pino structured logging, Joi env validation, fail-fast startup (`development_plan.md`, `plan_backend.md`) | None of these are in the backend. It uses the NestJS `Logger`, and missing keys only log a warning and disable the feature. | Every setting is validated at startup and production refuses to start without its secrets; still the NestJS `Logger`, no Sentry |
| Phantom and Backpack wallets (`development_plan.md`, `plan_frontend.md`) | Phantom and Solflare | Phantom, Solflare and any Wallet Standard wallet |
| `RwaClient` SDK with `invest()`, `harvestTransferFees()`, `unfreezeAccount()` (`development_plan.md`) | Not written. | A generated Codama client, `sdk/axel-v2` ([../v2.md](../v2.md#idl-and-typescript-client)), and the frontend's own client |
| `close_project` does "cleanup and rent reclaim" (spec §4) | It sweeps the revenue vault to the admin and sets status Closed. No accounts are closed. | It moves no funds; revenue stays claimable, and holders close their own positions to reclaim rent |
| Deposit snapshot "prevents manipulation (buying tokens right before payout)" (`ru/project-overview.md`) | Only the denominator is snapshotted. Payouts use the claimant's current balance ([v1 limitation 2](../architecture.md#v1-limitations)). | A per-share accumulator with checkpoints; the hook settles both sides on every transfer |
| Routes: `/` landing page and `/assets` catalog (`ru/project-overview.md`) | `/` is the catalog. There is no `/assets` index route, only `/assets/[id]`. | `/` is the landing page with the catalog; there is still no `/assets` index route |
