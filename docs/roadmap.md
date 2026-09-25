# Roadmap

A checked box means the work is in this repository and its tests pass, or, where stated, it is on devnet. An unchecked box is not done, whatever the text around it says.

## Pre-hackathon baseline (Mar 28 – Apr 7, 2026)

Tag `pre-hackathon` = commit `cd2c12c` (2026-04-07). Everything up to that commit was written before Colosseum Crypto World's Fair began:
- Frontend and product: Dmitriy Tsoy.
- Anchor programs, backend and chain integration: Andrey S (`ndrkbrg`).

An AXEL project draft was created on Colosseum for the Frontier hackathon (spring 2026) but was never submitted.

- [x] Specification and team plans (now in [planning/](planning/))
- [x] v1 `axel` Anchor program with 12 instructions: project setup, whitelist, direct sale, revenue deposit and claim, pause / resume / close, telemetry, price update, mint-authority revoke
- [x] Token-2022 share mint with six extensions: TransferHook, DefaultAccountState (Frozen), PermanentDelegate, TransferFeeConfig (1%), MetadataPointer, TokenMetadata
- [x] v1 `transfer_hook` program that checks both wallets against the whitelist on every transfer
- [x] Integration tests: 12 files, 49 `node:test` cases run against a local validator
- [x] Both programs deployed to devnet; two test projects created with `scripts/init-project.ts`
- [x] NestJS backend: `GET /health`, `GET /telemetry/latest/:projectId`, `POST /kyc/webhook`, and a Yandex Fleet ingestion cron
- [x] Next.js frontend wired to the program: catalog, asset page and buy, dashboard with claim, payout history, admin panel, EN / RU / KK
- [x] Codama client generation script (`npm run generate`)

## Crypto World's Fair (Sep 14 – Oct 12, 2026)

### Done

Repository groundwork:
- [x] Vendored the IDL so a fresh clone builds without `anchor build`; fixed the local Content-Security-Policy
- [x] Green frontend unit suite and CI for the frontend, the backend and the programs
- [x] English documentation; the historical plans moved to [planning/](planning/) and the Russian overview to [ru/](ru/)
- [x] License, contributing and security notes, logo and screenshots; platform-tools pinned so `anchor build` works

The v2 program ([v2.md](v2.md)):
- [x] Config, KYC registry with a scoped demo key, and the accumulator math with property tests
- [x] Escrowed primary market: share mint, purchases, finalize, activation with a document hash, cancellation and refunds
- [x] Transfer hook inside the program, with a position ledger, and opening and closing positions
- [x] Attested revenue deposits, claims (also for another owner), the telemetry hash chain, pause, resume, roles, close and the `Final` deposit
- [x] Time-locked share recovery with the owner's veto
- [x] Hard caps, the state × instruction matrix, the Codama SDK in `sdk/axel-v2`, and CI checks that the vendored IDL and the SDK match the build
- [x] Every v1 program limitation closed and tested ([v1 limitation → v2 fix](v2.md#v1-limitation--v2-fix))

Frontend:
- [x] Redesign: landing page, car, portfolio, payouts and operator pages, self-hosted fonts, licensed photos, accessibility checks ([frontend/design.md](../frontend/design.md))
- [x] Moved to `axel_v2`: client, hooks, amounts in the payment token, the six project states, KYC records, escrowed buys, refunds, claims, hooked transfers ([architecture.md](architecture.md#frontend))
- [x] v2 screens: soft-cap marker, live escrow, state timeline, refund dialog, in-browser verification of telemetry, reports and purchase papers, Proof of solvency, recovery flows, console split by role, demo data banner
- [x] Judge demo path (`/demo` and the `/api/demo` routes) and Solana Actions for investing and claiming ([api.md](api.md#judge-demo-api))

Backend:
- [x] KYC on v2: wallet sign-in, Sumsub sessions bound to the wallet, a hardened webhook that writes `set_investor` with a dedicated key, CORS, rate limits, startup checks ([api.md](api.md#backend-http-endpoints))
- [x] The v2 oracle: several cars, the rent model, published RFC 8785 days, crash-safe `record_telemetry` batches, attested revenue reports, simulated data flagged and refused on mainnet ([architecture.md](architecture.md#oracle--telemetry-flow))
- [x] Event indexer: program history plus a live log subscription in SQLite, `GET /events`, project histories and claim totals, tested against `solana-test-validator` ([architecture.md](architecture.md#event-indexer-v2))
- [x] Wiring: the payouts API the frontend reads (`GET /v2/wallets/:wallet/payouts`, with `pending` replayed exactly from the events), each car's data published in the layout "Verify" reads, `dataOrigin` on every telemetry and report response, and the operator's deposit flow (`POST /v2/deposits/draft`), tested against `solana-test-validator` ([api.md](api.md#deposit-draft-operator-flow))

Demo data and integration:
- [x] Demo seed ([scripts/seed-devnet](../scripts/seed-devnet/README.md)): a fictional fleet in every project state, an idempotent and resumable executor, the SOL budget, publishing, and proof of solvency (I1–I5). It ran on local validators at every scale.
- [x] The three workstreams merged, with the telemetry status codes and the demo keys aligned across the seed, the backend and the demo routes, and contract tests that pin them
- [x] End-to-end tests (Playwright, in CI) of the judge path and the KYC refusal against the app, the backend and `axel_v2` on a freshly seeded local validator ([CONTRIBUTING.md](../CONTRIBUTING.md#end-to-end-tests))
- [x] Documentation for v2: README, [architecture](architecture.md), [API](api.md) with the full program reference, [product](product.md) and this roadmap

### Blocked or still to do before the deadline

- [ ] **Deploy `axel_v2` to devnet** under its reserved ID. Blocked: it needs about 4.12 SOL of rent, and no devnet SOL is available.
- [ ] **Seed the demo fleet on devnet** at full scale (about 1.62 SOL, run twice an hour apart for the recovery), then commit `frontend/public/demo-data/` and `scripts/seed-devnet/out/devnet.json`. Needs the deployed program and the public site's URL.
- [ ] **Deploy the web app publicly** (Vercel) on devnet: the demo keys from `scripts/demo-env.mjs`, `NEXT_PUBLIC_DEMO_ACCESS=1`, Upstash Redis, `NEXT_PUBLIC_PAYMENT_MINT_SYMBOLS`, and a faucet funded with about 1.8 SOL ([api.md](api.md#frontend-environment)).
- [ ] **Host the backend** as a single instance with a persistent SQLite file, its oracle key, and CORS for the public site, so the trip data widget and the event history work.
- [ ] **Record the videos**: a product demo of 3 minutes or less and a pitch of 2 minutes or less.
- [ ] **Push the v2 work and run CI on GitHub.** `origin/main` ends at `b23ce21` (the README rewrite). Everything after it, including the v2 program, the backend and frontend on v2, the seed and the end-to-end job, has been checked locally only.

## Next Steps

These close the open items in [architecture.md](architecture.md#known-limitations).

- [ ] KYC in the web app: sign in with the wallet, then the Sumsub WebSDK with the token from `POST /kyc/session`; one sandbox run to confirm the Sumsub request formats
- [ ] The operator's deposit flow in the console (`POST /v2/deposits/draft` → the operator's wallet signs → send), and the telemetry widget's `dataOrigin` label
- [ ] Publish real cars' purchase papers from the backend, and let one deployment verify both the seed's cars and the backend's ([api.md](api.md#published-car-data-read-by-verify))
- [ ] Run the Yandex Fleet requests against a real park's credentials: the orders, driver profiles and transactions formats, and the rent category
- [ ] Require the `Final` deposit before `close_project`, or make the order explicit in the console
- [ ] Project creation in the console
- [ ] `test:seed`, the backend's `test:localnet` and the v1 tests in CI

## Before Mainnet

These items are not scheduled.

- [ ] Independent security audit of `axel_v2`
- [ ] Squads multisigs as the config admin and the upgrade authority, and a recovery delay of at least 72 hours ([programs/axel-v2/README.md](../programs/axel-v2/README.md#mainnet-requirements))
- [ ] A tenge stablecoin or USDC as the payment mint, vetted against the program's extension policy, with its issuer's powers disclosed in the app
- [ ] Legal structure for offering vehicle shares (jurisdiction, investor eligibility). The repository does not cover this.
- [ ] A live vehicle connected through Yandex Fleet API credentials, in place of simulated telemetry
- [ ] Separate keys, or a key-management service, for the backend's KYC and oracle roles

## Later

These items are not scheduled.

- [ ] More than one telemetry source or oracle per car
- [ ] A secondary market for shares, through the transfer hook
- [ ] Sponsored transactions, so a new investor needs no SOL for fees
