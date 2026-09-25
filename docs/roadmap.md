# Roadmap

A checked box means the work is in the repository or on devnet. Unchecked items are next steps. None of them is done unless it is checked.

## Pre-hackathon baseline (Mar 28 – Apr 7, 2026)

Tag `pre-hackathon` = commit `cd2c12c` (2026-04-07). Everything up to that commit was written before Colosseum Crypto World's Fair began:
- Frontend and product: Dmitriy Tsoy.
- Anchor programs, backend and chain integration: Andrey S (`ndrkbrg`).

An AXEL project draft was created on Colosseum for the Frontier hackathon (spring 2026) but was never submitted.

- [x] Specification and team plans (now in [planning/](planning/))
- [x] `axel` Anchor program with 12 instructions: project setup, whitelist, direct sale, revenue deposit and claim, pause / resume / close, telemetry, price update, mint-authority revoke
- [x] Token-2022 share mint with six extensions: TransferHook, DefaultAccountState (Frozen), PermanentDelegate, TransferFeeConfig (1%), MetadataPointer, TokenMetadata
- [x] `transfer_hook` program that checks both wallets against the whitelist on every transfer
- [x] Integration tests: 12 files, 49 `node:test` cases run against a local validator
- [x] Both programs deployed to devnet; two test projects created with `scripts/init-project.ts`
- [x] NestJS backend: `GET /health`, `GET /telemetry/latest/:projectId`, `POST /kyc/webhook`, and a Yandex Fleet ingestion cron
- [x] Next.js frontend wired to the program:
  - catalog, asset page and buy
  - dashboard with claim
  - payout history
  - admin panel (whitelist, deposit, pause / resume / close)
  - EN / RU / KK locales
- [x] Codama client generation script (`npm run generate`)

## Crypto World's Fair (Sep–Oct 2026)

Done:
- [x] Vendored the program IDL into `frontend/src/lib/solana/idl/` so a fresh clone builds without `anchor build`, and fixed the local dev CSP
- [x] English documentation: [product](product.md), [architecture](architecture.md), [API](api.md), this roadmap. The Russian overview moved to [ru/](ru/) and the planning documents to [planning/](planning/).
- [x] Replaced the stale v1 Codama output with a client generated for the v2 program in `sdk/axel-v2` ([v2.md](v2.md))

Next steps. Each one addresses a limitation listed in [architecture.md](architecture.md#known-limitations):
- [ ] Restrict `add_to_whitelist` / `remove_from_whitelist` to an authorized key (program upgrade)
- [ ] Make revenue claims independent of shares bought or transferred after a deposit (program upgrade)
- [ ] Thaw token accounts without relying on `buy_tokens` creating the ATA (program upgrade)
- [ ] Create the hook's `ExtraAccountMetaList` during project setup, and add an end-to-end test of a holder-to-holder transfer on a full six-extension mint
- [ ] Fix the account list in the backend's `record_telemetry` transaction, and mark simulated telemetry as simulated in the API
- [ ] Connect the dashboard telemetry widget to the backend: one env variable, CORS enabled
- [ ] Connect KYC in the UI (Sumsub with `externalUserId` = wallet) in place of the unmounted Blockpass prompt, and fix `useWhitelistStatus`
- [ ] Public frontend deployment and a documented devnet demo path for judges (a whitelisted test wallet)
- [ ] Recorded end-to-end devnet run with Explorer links: whitelist → buy → deposit → claim → transfer

## Before Mainnet

These items are not scheduled.

- [ ] Independent security audit of both programs
- [ ] Privileged authorities held by a multisig. Squads is planned in [planning/plan_onchain.md](planning/plan_onchain.md) (US-O15, post-MVP); not implemented.
- [ ] Collection and destination of the withheld 1% transfer fees
- [ ] Legal structure for offering vehicle shares (jurisdiction, investor eligibility). The repository does not cover this.
- [ ] A live vehicle connected through Yandex Fleet API credentials, in place of simulated telemetry

## Later

These items are not scheduled.

- [ ] Multi-vehicle operations. The program already supports one project per mint; the admin panel manages only the first project, and projects can only be created from the CLI.
- [ ] Project creation and price management in the admin UI
- [ ] More than one telemetry source or oracle. The spec lists the single centralized oracle as an MVP constraint.
- [ ] Show each period's telemetry hashes next to its revenue deposit, so holders can compare them
