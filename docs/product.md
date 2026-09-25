# Product

This page describes the v1 product that runs on devnet today. The frontend has already moved to the v2 program ([v2.md](v2.md)), which is not deployed yet: there, buyers pay a stablecoin into escrow and get a refund if the raise fails, KYC is a per-wallet record written by the KYC key, revenue is claimed per car whenever the holder likes, and transfers need no fee. [architecture.md](architecture.md#frontend) lists what each page does on v2.

## What is AXEL?

AXEL tokenizes taxi cars on Solana. Each car is a project with its own Token-2022 mint. The car's VIN, make, model, year and valuation are stored in on-chain token metadata.

- **Buying.** Wallets that passed KYC and are whitelisted buy whole shares for SOL at a fixed price.
- **Revenue.** The car owner deposits the car's revenue into a program vault once per period. Each holder claims a pro-rata share.
- **Transfers.** A transfer hook lets shares move only between whitelisted wallets.
- **Telemetry.** A backend oracle writes a daily SHA-256 hash of the car's Yandex Pro telemetry (trips, mileage, revenue) on-chain.

**Status:** MVP on Solana devnet, not audited. Only devnet SOL is involved. Nothing in the repository shows a live vehicle or Yandex Fleet park connected. [architecture.md](architecture.md#known-limitations) lists the open issues.

## Problem

1. **Owning a cash-flowing car is all-or-nothing.** A taxi earns every day, but getting that income means buying and running the whole car. There is no simple way to hold a small, transferable share of one specific vehicle.
2. **Income reported by the owner is hard to check.** Ride-hailing platforms such as Yandex Pro already record every order per car. Co-investors normally see only what the owner chooses to report.
3. **Shares of a real asset need holder rules.** A plain SPL token can be sent to anyone. Real-asset shares need an allow-list of holders, and they need that list enforced on every transfer, not only on the first sale.

## Target Users

- **Car owner / operator (project admin).** The owner already owns a car and runs it through Yandex Pro. They sell shares in it and then deposit its revenue each period. Per the spec, the admin "already owns the vehicle". AXEL is a direct sale of ownership shares, not a fundraise.
- **Investors.** Individuals with a Solana wallet (Phantom or Solflare in the UI) who pass KYC. They want small, direct exposure to one real vehicle's income, and payouts they can check on-chain.
- **Platform operator.** Runs the backend: the oracle keypair that records telemetry, and the KYC webhook that whitelists approved wallets.

## How It Works

1. **Create a project.**
   - The owner runs `npm run init-project`, which calls `initialize_project`.
   - This creates a Token-2022 mint with 0 decimals and fixes the maximum share count: `car_cost / price_per_share`.
   - No shares exist yet. There is no UI for this step.
2. **Get whitelisted.** An investor's wallet gets a `WhitelistEntry` in one of two ways:
   - The backend's Sumsub webhook, after a `GREEN` review.
   - Calling `add_to_whitelist` directly. The v2 console writes KYC records instead.
3. **Buy shares.**
   - On the asset page, the investor picks a number of shares.
   - `buy_tokens` sends `shares × price` in SOL straight to the owner's wallet, then mints the shares into the investor's token account.
   - On a first purchase it also creates that account and unfreezes it.
4. **Deposit revenue.**
   - The owner deposits the period's net amount with `deposit_revenue`, in SOL. (The v1 admin panel had a form for it; the v2 console leaves deposits to the backend, because v2 needs the oracle's co-signature.)
   - The program records the number of shares sold at that moment.
5. **Claim.** On the dashboard, each holder claims `balance / shares sold at deposit × period amount` from the vault, once per wallet per period. "Claim all" batches several periods into one transaction.
6. **Transfer.**
   - Holders can send shares to another whitelisted wallet.
   - Token-2022 withholds a 1% fee, in shares, from each transfer.
   - The hook rejects any transfer where either side is not whitelisted.
7. **Verify activity.**
   - The backend fetches the previous day's Yandex orders for the car's licence plate and hashes the daily figures.
   - It records the hash in a `TelemetryRecord` PDA.
   - Anyone with the same figures can recompute the hash and compare.

## Business Model (as implemented)

| Money flow | Payer → receiver | Mechanism |
|---|---|---|
| Primary sale | Investor → admin wallet, at purchase time | `buy_tokens` transfers `shares × price_per_share` lamports. There is no escrow, deadline or refund. |
| Revenue distribution | Admin → revenue vault → holders | `deposit_revenue` once per period, then `claim_revenue` pro-rata by each holder |
| Secondary transfer fee | Sender → withheld in recipient's token account (shares, not SOL) | Token-2022 `TransferFeeConfig`, 100 bps, no maximum. The admin is the withdraw-withheld authority. No instruction or UI collects the fees yet. |
| Project close | Revenue vault → admin | `close_project` sweeps the whole vault, including any unclaimed revenue |

What the code does **not** contain:

- **No platform fee** or subscription of any kind.
- **No off-chain pricing.** Prices are set in SOL by the admin (`update_price`, no UI).
- **No enforced revenue formula.** The spec's formula `Profit = Revenue − Expenses − Reserve` is computed only in the admin form. The program records whatever amount is deposited.
- **No revenue tie-in to telemetry.** The backend's `0.76` factor turns gross order value into an estimated net revenue for telemetry only. It is not linked to deposits.

## What Is Enforced vs What Is Trusted

| Enforced by the programs | Still trusted off-chain |
|---|---|
| Only whitelisted wallets can buy, and both sides of a transfer must be whitelisted | Who gets whitelisted. KYC runs off-chain, and the current program lets any signer edit the whitelist ([known limitation](architecture.md#known-limitations)). |
| Supply cap; mint authority can be revoked for good once all shares are sold | That the car exists and matches the VIN in metadata |
| Pro-rata payout math, one claim per wallet per period | That the admin deposits the car's real net revenue |
| Only the registered oracle can write telemetry, once per day | That the oracle's data really came from Yandex. The backend falls back to simulated data. |
| Price, supply, sales, deposits and claims are all public accounts | The admin's use of permanent-delegate, fee and close powers |

## MVP Limits

- **Devnet only.** Two test projects exist, both created by the seed script with the same test car metadata (Toyota Camry 2023). Nothing is deployed to mainnet, and the programs have not been audited.
- **One car per project.** The program supports many projects (one per mint); the v2 console switches between them, and projects can only be created from the CLI.
- **Centralized oracle.** A single backend keypair and a single data source (Yandex Fleet API). Without Yandex credentials, the telemetry is simulated.
- **Global whitelist.** One `WhitelistEntry` per wallet covers every project.
- **Units.**
  - Prices and payouts are in SOL; telemetry revenue is in KZT.
  - No fiat on- or off-ramp.
  - Shares are whole units, and the 1% fee rounds up to at least one share per transfer.
- **KYC loop not wired in the UI.** The backend webhook exists, but the frontend has no KYC flow. The asset page only reads the wallet's KYC record and explains why buying is unavailable.
- **Single keys.** Admin and oracle are single keys. On devnet they are the same key. No multisig is configured.
