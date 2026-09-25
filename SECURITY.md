# Security Policy

## Status

- The Anchor programs in `programs/` have **not been audited**.
- `axel_v2`, the program the app, the backend and the demo seed use, is **not deployed** anywhere public yet. It runs on LiteSVM and local validators.
- The legacy v1 programs are deployed on **Solana devnet only**. There is no mainnet deployment. Do not use this code with real funds.

## Scope

| Component | Location |
| :--- | :--- |
| `axel_v2` program | source in `programs/axel-v2`; program ID `AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi` (reserved, not deployed) |
| Backend (telemetry oracle and deposit attestation, KYC sign-in and webhook, event indexer) | `backend/` |
| Frontend, including the judge demo routes (`frontend/src/app/api/demo`) and the Solana Actions (`frontend/src/app/api/actions`) | `frontend/` |
| Demo seed | `scripts/seed-devnet/` |
| Legacy `axel` program (v1) | devnet `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`, source in `programs/axel` |
| Legacy `transfer_hook` program (v1) | devnet `5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`, source in `programs/transfer-hook` |

Out of scope: third-party services (Solana RPC providers, Yandex Fleet, Sumsub, Upstash, Cloudflare, wallet extensions), the devnet cluster itself, the known limitations of v1 (fixed in v2, see [docs/v2.md](docs/v2.md#v1-limitation--v2-fix)), and the known limitations listed below.

## Reporting a vulnerability

Report privately through GitHub: **[Report a vulnerability](https://github.com/dmitriytsoy22/axel-sol/security/advisories/new)**. Do not put vulnerability details in a public issue or pull request.

Include:

- the affected component (program and instruction, or backend endpoint, or frontend route) and the commit hash;
- steps to reproduce, ideally a failing test in `tests-v2/` (LiteSVM) or `backend/src`;
- the impact you expect.

Test against LiteSVM, a local validator or accounts you control. AXEL is maintained by one person, so reports are handled on a best-effort basis.

## Security model in short

- **Program authority.** No human key holds any authority over a share mint. Mint, freeze, permanent delegate and metadata authorities are the project PDA; the hook and the metadata pointer have none.
- **Vaults.** Money leaves the escrow only to the operator and the treasury on activation, or back to each buyer on refund. It leaves the revenue vault only to an owner's own account on claim.
- **Recovery.** The permanent delegate is used only by a time-locked recovery the owner can veto.
- **Deposits.** Every revenue deposit needs the oracle's co-signature.

Details: [docs/v2.md](docs/v2.md), [programs/axel-v2/README.md](programs/axel-v2/README.md) and the Security section of the [README](README.md#security).

## Known limitations

- **Unaudited program.** See Status above.
- **Single keys until mainnet.**
  - The admin and the upgrade authority are single keys on devnet and local validators.
  - Mainnet requires Squads multisigs for both and a recovery delay of at least 72 hours. The program enforces a delay of 1 hour to 30 days, not the 72-hour floor.
- **KYC key on the server.** The backend signs `set_investor` with the key at `KYC_AUTHORITY_KEYPAIR_PATH`, a plain JSON file.
  - Whoever holds it can approve or revoke any wallet, but cannot move funds or shares.
  - Keep it separate from the admin key and never commit it. Rotate it with `update_config` if it leaks.
  - Without `SUMSUB_WEBHOOK_SECRET` the webhook refuses every request, and in production the backend does not start.
- **Oracle key on the server.** The backend signs `record_telemetry` and co-signs deposits with the key at `ORACLE_KEYPAIR_PATH`. Whoever holds it can append telemetry and co-sign a deposit the operator signed, but cannot deposit alone or take funds. Replace it with `set_project_roles` if it leaks.
- **Demo keys on the web server** (devnet and localnet only):
  - the demo KYC key can write only DEMO records of at most 30 days;
  - the other four keys hold only test tenge, the desk's demo shares and the Demo Fleet car's operator and oracle roles.

  The demo routes answer 404 on any other cluster.
- **Rate limits need the client IP.** Behind a reverse proxy, set `TRUST_PROXY` on the backend, or all clients share one limit on `/kyc/nonce` and `/kyc/session`. The demo routes keep their limits in Upstash Redis only when it is configured; otherwise each server process keeps its own.
- **Single backend instance.** Webhook ordering, attestation locking and rate limits live in the process.
