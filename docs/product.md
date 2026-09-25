# Product

## What is AXEL?

AXEL tokenizes taxi cars on Solana. Each car is a project with its own Token-2022 mint. The car's VIN, make, model, year and valuation are stored in on-chain token metadata.

- **Buying.** Wallets that passed KYC and are whitelisted buy whole shares for SOL at a fixed price.
- **Revenue.** The car owner deposits the car's revenue into a program vault once per period. Each holder claims a pro-rata share.
- **Transfers.** A transfer hook lets shares move only between whitelisted wallets.
- **Telemetry.** A backend oracle publishes each car's daily figures (trips, mileage, the rent the park charged) and appends their SHA-256 to the v2 program's hash chain. The v2 program is not deployed yet, and the backend writes no v1 telemetry.

**Status:** MVP on Solana devnet, not audited. Only devnet SOL is involved. Nothing in the repository shows a live vehicle or Yandex Fleet park connected. [architecture.md](architecture.md#known-limitations) lists the open issues.

## Problem

1. **Owning a cash-flowing car is all-or-nothing.** A taxi earns every day, but getting that income means buying and running the whole car. There is no simple way to hold a small, transferable share of one specific vehicle.
2. **Income reported by the owner is hard to check.** Ride-hailing platforms such as Yandex Pro already record every order per car. Co-investors normally see only what the owner chooses to report.
3. **Shares of a real asset need holder rules.** A plain SPL token can be sent to anyone. Real-asset shares need an allow-list of holders, and they need that list enforced on every transfer, not only on the first sale.

## Target Users

- **Car owner / operator (project admin).** The owner already owns a car and runs it through Yandex Pro. They sell shares in it and then deposit its revenue each period. Per the spec, the admin "already owns the vehicle". AXEL is a direct sale of ownership shares, not a fundraise.
- **Investors.** Individuals with a Solana wallet (Phantom or Solflare in the UI) who pass KYC. They want small, direct exposure to one real vehicle's income, and payouts they can check on-chain.
- **Platform operator.** Runs the backend, with a separate key for each role:
  - the daily telemetry job and the co-signing of revenue deposits, as the projects' v2 oracle;
  - the KYC flow, whose webhook writes v2 KYC records.

## How It Works

1. **Create a project.**
   - The owner runs `npm run init-project`, which calls `initialize_project`.
   - This creates a Token-2022 mint with 0 decimals and fixes the maximum share count: `car_cost / price_per_share`.
   - No shares exist yet. There is no UI for this step.
2. **Get whitelisted.** On v1 an investor's wallet gets a `WhitelistEntry` from the admin panel's whitelist manager. The backend's Sumsub flow writes v2 KYC records, which v1 does not read.
3. **Buy shares.**
   - On the asset page, the investor picks a number of shares.
   - `buy_tokens` sends `shares × price` in SOL straight to the owner's wallet, then mints the shares into the investor's token account.
   - On a first purchase it also creates that account and unfreezes it.
4. **Deposit revenue.**
   - In the admin panel, the owner enters gross revenue, expenses and maintenance reserve for the period, in SOL.
   - The panel deposits the net amount (gross − expenses − reserve) with `deposit_revenue`.
   - The program records the number of shares sold at that moment.
5. **Claim.** On the dashboard, each holder claims `balance / shares sold at deposit × period amount` from the vault, once per wallet per period. "Claim all" batches several periods into one transaction.
6. **Transfer.**
   - Holders can send shares to another whitelisted wallet.
   - Token-2022 withholds a 1% fee, in shares, from each transfer.
   - The hook rejects any transfer where either side is not whitelisted.
7. **Verify activity (v2).**
   - The backend reads each day of the car from Yandex Fleet: trips and distance from the orders, and the rent from the park's charges.
   - It publishes the day as canonical JSON and appends its SHA-256 to the project's on-chain hash chain.
   - Anyone can fetch the published days, recompute the chain and compare it with the program's head.
   - The oracle co-signs a revenue deposit only when its report adds up from those days and the operator's stated expenses. The report's hash is stored with the deposit.

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
- **No revenue tie-in to telemetry on v1.** The v1 program records whatever amount the admin deposits. On v2 the backend's oracle co-signs a deposit only if it matches a report built from the published days: rent − park fee − maintenance − insurance.

## What Is Enforced vs What Is Trusted

| Enforced by the programs | Still trusted off-chain |
|---|---|
| Only whitelisted wallets can buy, and both sides of a transfer must be whitelisted | Who gets whitelisted. KYC runs off-chain, and the current program lets any signer edit the whitelist ([known limitation](architecture.md#known-limitations)). |
| Supply cap; mint authority can be revoked for good once all shares are sold | That the car exists and matches the VIN in metadata |
| Pro-rata payout math, one claim per wallet per period | That the admin deposits the car's real net revenue |
| Only the registered oracle can write telemetry, once per day (v1); on v2, days only append to a hash chain, and every deposit needs the oracle's co-signature | That the oracle's data really came from Yandex, and that the operator's expense items are complete. Simulated data is marked `data_origin: "simulated"` in every record and is refused on mainnet. |
| Price, supply, sales, deposits and claims are all public accounts | The admin's use of permanent-delegate, fee and close powers |

## MVP Limits

- **Devnet only.** Two test projects exist, both created by the seed script with the same test car metadata (Toyota Camry 2023). Nothing is deployed to mainnet, and the programs have not been audited.
- **One car per project.** The program supports many projects (one per mint), but the admin panel manages only the first project it finds, and projects can only be created from the CLI.
- **Centralized oracle.** A single backend keypair and a single data source (Yandex Fleet API). A car can be configured as simulated, and its records say so.
- **Global whitelist.** One `WhitelistEntry` per wallet covers every project.
- **Units.**
  - Prices and payouts are in SOL; telemetry revenue is in KZT.
  - No fiat on- or off-ramp.
  - Shares are whole units, and the 1% fee rounds up to at least one share per transfer.
- **KYC loop not wired in the UI.** The backend's sign-in and Sumsub endpoints exist and write v2 records, but the frontend has no KYC flow and still reads v1. The asset page only reads whether the connected wallet is approved and explains why buying is unavailable.
- **Single keys.** Admin and oracle are single keys. On devnet they are the same key. No multisig is configured.
