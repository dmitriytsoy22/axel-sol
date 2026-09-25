# Security Policy

## Status

- The Anchor programs in `programs/` have **not been audited**.
- They are deployed on **Solana devnet only**. There is no mainnet deployment. Do not use this code with real funds.

## Scope

| Component | Location |
| :--- | :--- |
| `axel` program | devnet `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`, source in `programs/axel` |
| `transfer_hook` program | devnet `5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`, source in `programs/transfer-hook` |
| Backend (telemetry oracle, KYC webhook) | `backend/` |
| Frontend | `frontend/` |

Out of scope: third-party services (Solana RPC providers, Yandex Fleet, Sumsub, wallet extensions), the devnet cluster itself, and the known limitations listed below.

## Reporting a vulnerability

Report privately through GitHub: **[Report a vulnerability](https://github.com/dmitriytsoy22/axel-sol/security/advisories/new)**. Do not put vulnerability details in a public issue or pull request.

Include:

- the affected component (program and instruction, or backend endpoint) and the commit hash;
- steps to reproduce, ideally a failing test in `tests/` or devnet transaction signatures;
- the impact you expect.

Test against a local validator or accounts you control. AXEL is maintained by one person, so reports are handled on a best-effort basis.

## Known limitations

- **Unaudited programs.** See Status above.
- **Admin is the permanent delegate.** `initialize_project` sets the project admin as the Token-2022 `PermanentDelegate` of the project mint, so the admin can transfer or burn tokens from any holder. This is intentional.
- **KYC webhook without a secret.** If `SUMSUB_WEBHOOK_SECRET` is empty, `POST /kyc/webhook` skips signature verification. With `ADMIN_KEYPAIR_PATH` set, anyone who can reach the backend can then trigger `add_to_whitelist`. Always set both variables together.
- **Keypairs on disk.** The backend loads the oracle and admin keypairs from plain JSON files (`ORACLE_KEYPAIR_PATH`, `ADMIN_KEYPAIR_PATH`). Never commit these files.
