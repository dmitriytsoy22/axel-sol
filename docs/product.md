# Product

This page describes AXEL as built on the v2 program, `axel_v2` ([v2.md](v2.md)). v2 is not deployed yet: it runs on local validators and in the end-to-end suite, with a fictional demo fleet. The v1 product that has been on devnet since April 2026 is summarized at the end ([v1, the pre-hackathon product](#v1-the-pre-hackathon-product)).

## What is AXEL?

AXEL lets people own shares of a specific working taxi car in Kazakhstan and receive its income on Solana.

- **One car, one project.** Each car has its own project account and its own Token-2022 share mint. The car's make, model, year, city, class and park are in the mint's on-chain metadata.
- **Raise in escrow.** Verified investors buy whole shares at a fixed price in a stablecoin (tKZT test tenge on devnet). The money waits in the project's escrow vault. If the raise misses its soft cap by the deadline, or the car is not bought in time, every buyer gets exactly their money back.
- **The fleet runs the car.** When the raise succeeds, the platform releases the escrow to the fleet operator against the hash of the car's purchase documents. The operator puts the car on the road with drivers through a taxi park.
- **Attested income.** Each month the operator deposits the car's net income. The platform's oracle co-signs a deposit only when its report adds up from the car's published daily trip data, and the report's hash goes on-chain with the deposit.
- **Claims and transfers.** Each holder claims its share of every deposit whenever it likes. Shares can move only between verified wallets, and the income earned before a transfer stays with the sender.
- **Recovery.** A holder who loses its wallet, or its heirs, can get the shares back through a time-locked process the owner can veto.

**Status:** not deployed and not audited. The demo data is fictional, and no live vehicle or Yandex Fleet park is connected. [architecture.md](architecture.md#known-limitations) lists the open issues.

## Problem

1. **Owning a cash-flowing car is all-or-nothing.** A taxi earns every day, but getting that income means buying and running the whole car. There is no simple way to hold a small, transferable share of one specific vehicle, or to pool money safely for a car that is not bought yet.
2. **Income reported by the owner is hard to check.** Ride-hailing platforms such as Yandex Pro already record every order per car. Co-investors normally see only what the owner chooses to report.
3. **Shares of a real asset need holder rules.** A plain SPL token can be sent to anyone. Real-asset shares need an allow-list of holders, and they need that list enforced on every transfer, not only on the first sale.

## Target Users

- **Investors.** Individuals with a Solana wallet who pass KYC. They want small, direct exposure to one real vehicle's income, payouts they can check on-chain, and their money back if the car is never bought.
- **Fleet operators.** Taxi fleets in Kazakhstan's cities (the demo has Almaty, Astana and Shymkent) that want to add cars without borrowing. They receive the raise to buy the car, run it, and deposit its income each month.
- **The platform.** It creates projects, releases raises, runs KYC and the oracle, and earns fees. Each of its roles has a separate key:
  - the admin (a Squads multisig on mainnet);
  - the KYC key, held by the backend;
  - the oracle key, held by the backend;
  - the treasury.

## How It Works

1. **KYC.** An investor's wallet gets an `Investor` record: active, with an expiry and a jurisdiction.
   - The backend writes it after Sumsub approves the wallet, which first signs in with Sign-In With Solana.
   - The console's KYC tab can write it by hand.
   - On devnet the judge demo writes a 29-day DEMO record that only demo cars accept.
2. **Open a raise.** The admin creates the project: the share mint, the price per share in a stablecoin, the number of shares, the soft cap, the raise deadline, the activation window, the operator and the oracle. There is no UI for this step yet; the demo seed creates the projects.
3. **Buy shares.** On the car page the investor picks a number of shares. The dialog explains where the money goes, the refund rule, and any power the stablecoin's issuer has to freeze funds. `buy_shares` pays into the escrow and mints the shares.
4. **Settle the raise.** When the outcome is certain, anyone can settle it: Funded (the soft cap was met, and the raise sold out or reached its deadline) or Failed. In Failed each buyer takes a refund of exactly what they paid, and the refund dialog settles the raise first if nobody has.
5. **Release to the operator.** The admin activates a funded raise before its activation deadline, with the purchase documents' hash. The platform's raise fee goes to the treasury, and the rest to the operator. The car is now "On the road".
6. **Record the car's days.** The backend publishes each day of the car and appends its hash to the project's on-chain chain. A day's record holds the trips, kilometres, the rent the park charged, and whether the data is real or simulated.
7. **Deposit income.** For each month:
   - the operator drafts a report with the backend: rent from the published days − park fee − maintenance − insurance;
   - the operator signs the `deposit_revenue` that report implies;
   - the backend's oracle adds its signature only if the deposit matches the rebuilt report.

   The platform's revenue fee goes to the treasury, and the rest is split among holders at once, by shares.
8. **Claim.** The portfolio shows exactly what a claim pays now. A holder claims per car or with "Claim all" (up to four cars per transaction), and the money always goes to the holder's own token account.
9. **Transfer.** A holder sends shares to another verified wallet. The recipient's KYC is checked while its address is typed, and a first-time recipient is onboarded in the same transaction. The hook checks both wallets on every transfer, whichever app sends it.
10. **Verify.** "Check the car's data yourself" on the car page recomputes, in the browser, the chain of published days and every report hash, and compares them with the chain. The Proof of solvency page checks every car's vaults against what the program owes.
11. **End of the car's life.** When the car is sold, the proceeds are deposited as a `Final` payout and the project is closed. Claims stay open for good.

## Business Model

| Money flow | Payer → receiver | Mechanism |
|---|---|---|
| Raise | Investors → escrow → operator | `buy_shares` into the escrow; `activate_project` pays the operator. Refunds from the escrow if the raise fails |
| Raise fee | Escrow → treasury, at activation | `raise_fee_bps` of the raise; at most 5%, the demo uses 2% |
| Monthly income | Operator → revenue vault → holders | `deposit_revenue` with the oracle's co-signature, then `claim` by or for each holder |
| Revenue fee | Deposit → treasury | `revenue_fee_bps` of each deposit; at most 20%, the demo uses 5% |
| Sale of the car | Operator → revenue vault → holders | A `Final` deposit through the same accumulator, charged the same revenue fee |

- **Fees are fixed per project.** Both rates are copied from the config when the project is created, so a later config change never touches an existing car.
- **No transfer fee.** Transfers between holders cost only the Solana network fee.
- **Demo figures.** Car prices, rents, the park's fee and expenses in the demo seed are labelled assumptions ([`scripts/seed-devnet/economics.ts`](../scripts/seed-devnet/economics.ts)). They have not been checked against real listings and parks.

## What Is Enforced vs What Is Trusted

| Enforced by the program | Still trusted off-chain |
|---|---|
| Only wallets with an eligible KYC record can buy, receive or send shares; the hook checks both owners on every transfer | That the KYC provider verified the person correctly |
| The raise sits in escrow until activation; a failed raise refunds every buyer exactly; activation needs the purchase documents' hash | That the operator really bought the car the documents describe |
| Every deposit carries the oracle's co-signature, the report hash and the telemetry head; the telemetry chain is append-only | That the fleet system reported the truth and that the operator's expense items are complete. Simulated data is marked `data_origin: "simulated"` in every record and refused on mainnet |
| Pro-rata payouts through the accumulator; payouts never exceed net deposits; money goes only to the owner's own account | That the operator deposits every month's income |
| Fees capped at 5% and 20% and fixed per project; the price is immutable; no instruction sweeps a vault | That the admin activates, pauses and closes projects in good faith, within those limits |
| Recovery needs a time lock and gives the owner a veto | That the admin proposes recoveries only for genuine lost-key or inheritance cases |

## MVP Limits

- **Not deployed.** v2 runs on local validators; devnet deployment is blocked on devnet SOL. The programs have not been audited.
- **Fictional demo fleet.** Every car, park and investor in the demo is generated by `scripts/seed-devnet` and labelled as such, and tKZT has no market value.
- **Centralized oracle.** One backend key per project and one data source, Yandex Fleet, whose request formats have not been run against a real park.
- **Not every flow is in the web app yet.**
  - Project creation happens in the seed or a script.
  - The operator's attested deposit flow runs through the backend's API; the console does not call it.
  - The Sumsub KYC flow exists in the backend; the web app does not start it.
- **Units.** Prices and payouts are in the project's payment stablecoin; report figures are whole tenge. There is no fiat on- or off-ramp. Shares are whole units.
- **Single keys on devnet.** The admin, KYC, oracle and upgrade keys are single keys; mainnet requires Squads multisigs for the admin and the upgrade authority.

## v1, the pre-hackathon product

The v1 programs (`axel` and `transfer_hook`) are on devnet since 2026-04-07, with two test projects. They sold shares directly for SOL: the admin received the money at once, with no escrow or refund.

- **KYC.** A global whitelist that any signer could edit.
- **Revenue.** The admin deposited SOL once per period, and holders claimed on their current balance.
- **Transfers.** Token-2022 withheld a 1% fee on each transfer.

The web app no longer uses v1. Its limitations and the v2 fix for each are in [architecture.md](architecture.md#v1-limitations) and [v2.md](v2.md#v1-limitation--v2-fix).
