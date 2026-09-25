# Contributing to AXEL

Issues and pull requests are welcome. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Repository layout

| Path | What it is |
| :--- | :--- |
| `programs/axel`, `programs/transfer-hook` | v1 Anchor programs, kept as legacy (Token-2022 mint, sale, revenue, whitelist, telemetry; transfer hook) |
| `programs/axel-v2` | v2 Anchor program: escrowed raise, KYC registry, attested revenue deposits and claims, telemetry hash chain, time-locked share recovery, transfer hook in one program. Design and test matrix: [docs/v2.md](docs/v2.md); admin powers and mainnet requirements: [programs/axel-v2/README.md](programs/axel-v2/README.md) |
| `tests/` | v1 program tests (`node:test`) run against a local validator at `http://127.0.0.1:8899` |
| `tests-v2/` | v2 program tests (`node:test`) on LiteSVM, with their own `package.json` |
| `scripts/` | `init-project.ts` (creates a v1 project on a cluster), `generate-clients.ts` (Codama client of the v2 program into `sdk/axel-v2`) |
| `scripts/seed-devnet/` | Demo seed for v2: a fictional fleet in every project state, with its own `package.json` ([README](scripts/seed-devnet/README.md)) |
| `sdk/axel-v2/` | Generated TypeScript client of `axel_v2` (`@solana/kit`), with tests against the IDL |
| `backend/` | NestJS service: the v2 oracle (published telemetry, `record_telemetry` batches, attested revenue reports), wallet sign-in and Sumsub KYC webhook (v2 `set_investor`), and the v2 event indexer |
| `frontend/` | Next.js 14 app on `axel_v2`, with the judge demo routes, the Solana Actions and the Playwright suite in `frontend/e2e` |

## Prerequisites

- Node.js 22 LTS. The backend (NestJS 11) needs Node >= 20, and the root test script passes a glob to `node --test`, which needs Node >= 21.
- For the programs only:
  - Rust 1.89.0, pinned in `rust-toolchain.toml` (rustup picks it up automatically).
  - Anchor CLI 0.32.1, matching `anchor-lang` / `anchor-spl` 0.32.1 in `programs/*/Cargo.toml`: `avm install 0.32.1 && avm use 0.32.1`.
  - Solana (Agave) CLI 2.3.x, tested with 2.3.13. Platform-tools v1.52 is pinned in the root `Cargo.toml` (`[workspace.metadata.solana]`) because `Cargo.lock` needs Cargo 1.85+; `cargo build-sbf` downloads it on first build.
  - A wallet at `~/.config/solana/id.json` (`[provider] wallet` in `Anchor.toml`).

## Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # devnet RPC and program ID are prefilled
npm run dev                         # http://localhost:3000
npm test                            # Vitest
npm run test:cov                    # Vitest with coverage
npm run lint                        # next lint over src/ and e2e/
npx tsc --noEmit                    # type check
npm run build                       # production build
```

UI changes follow [`frontend/design.md`](frontend/design.md): tokens, type, photos and their credits, motion, and the layout and accessibility rules.

The frontend runs on `axel_v2`. Its IDL is vendored in `frontend/src/lib/solana/idl-v2/` (`axel_v2.json`, `axel_v2.ts`), so the frontend builds without an Anchor toolchain. After changing the program, run `anchor build` and `npm run export-idl`; CI checks that the committed copy matches the build.

The client tests in `frontend/src/lib/solana/__tests__` read accounts the real program wrote (`fixtures/chain.json`). After a change to the program's accounts or math, regenerate them from the repository root with `npm run build && npm --prefix tests-v2 run export-frontend-fixture`. `npm --prefix tests-v2 run fixture-validator` loads the same accounts into a local validator for the app (see the README's Quick Start).

Transactions go through `hooks/useTransactionSender.ts`, which shows every outcome in a toast; a new program error needs a message in `ProgramErrors` in all three `messages/*.json` files, which `errors.test.ts` checks.

## Backend

```bash
cd backend
npm ci
cp .env.example .env
npm run start:dev     # watch mode; GET http://localhost:3001/health
npm run lint          # ESLint with type-aware typescript-eslint rules
npm test              # Jest: unit specs and HTTP specs of the whole app
npm run test:localnet # the event indexer and the operator's deposit flow against solana-test-validator (Agave on PATH, anchor build done)
npm run build         # compile to dist/
npm run start:prod    # node dist/main
```

Cars come from `FLEET_CONFIG`. A `simulated` car needs no credentials and is published with `data_origin: "simulated"`, while a `yandex_fleet` car needs the `YANDEX_*` credentials. `backend/.env.example` documents every variable the backend reads.

Backend tests boot the real `AppModule` (`src/testing/test-app.ts`) and replace only the outside world: the Solana RPC with `FakeRpc`, which checks signatures and applies `set_investor` with the IDL coder, the program's history and log subscription with `FakeLedger`, whose logs carry events encoded by the IDL coder, the Sumsub API with `FakeSumsub`, which checks request signatures, and the clock. The indexer is off in `createTestApp` unless a test sets `INDEXER_ENABLED=true`. `npm run test:localnet` (`*.localnet.ts`) starts its own `solana-test-validator` on free ports with `target/deploy/axel_v2.so` and sends real transactions; it is not part of `npm test` or CI. The v2 IDL is vendored in `backend/src/solana/idl/`; `npm run export-idl` in the root refreshes it with the frontend copy.

## End-to-end tests

`frontend/e2e` is a Playwright suite that drives the app, the backend and `axel_v2` together, with nothing faked. `npm run test:e2e` in `frontend/` first starts a local stack (`e2e/stack/global-setup.ts`), from scratch on every run:

1. `solana-test-validator` from an empty ledger, with `target/deploy/axel_v2.so` loaded as an upgradeable program.
2. The demo seed at `--scale tiny` with a random `DEMO_SEED_SECRET`, while `npm run build` compiles the backend. The seed takes about two minutes, most of it waiting for the failed raise's deadline.
3. The demo routes' keys from `frontend/scripts/demo-env.mjs`, and 5 SOL airdropped to the demo faucet.
4. A file server for the seed's published files, the backend with the event indexer, and `next dev` with `NEXT_PUBLIC_E2E=1`. The setup waits until the indexer has caught up with the seeded chain and `next dev` has compiled every page the tests open.

| Service | URL |
| :--- | :--- |
| Validator RPC (websocket on 18900, faucet on 19900) | `http://127.0.0.1:18899` |
| Frontend (`next dev`) | `http://127.0.0.1:13190` |
| Backend | `http://127.0.0.1:13411` |
| Published car data | `http://127.0.0.1:13101` |

The ports are fixed and chosen away from the tools' defaults, so the suite runs next to a validator on 8899 or a dev server on 3000. If one of them is taken, the setup stops and names it.

```bash
anchor build -p axel_v2                  # target/deploy/axel_v2.so; Agave CLI must be on PATH
npm --prefix backend ci
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e                         # about 3 minutes, most of it the seed
```

The seed installs its own dependencies (`npm run seed:deps`). The tests:

- `judge-path.spec.ts`, the judge path on `/demo`: connect a wallet, get demo access, buy a share in the open raise, receive the desk's shares of the Demo Fleet car, simulate a month and claim it, verify that car's published data in the browser, and open the proof of solvency. The claim is also checked outside the app: the wallet's tKZT balance on the validator grew by exactly the amount the page showed, which is also what the backend's `GET /v2/wallets/:wallet/payouts` said was pending, and the backend's `GET /positions/:owner/claims` and payouts recorded that amount.
- `kyc-required.spec.ts`: a wallet without a KYC record sees a disabled "Wallet not verified" button and no way to buy, and the invest Blink refuses to build a purchase for it.

**Wallet.** A build with `NEXT_PUBLIC_E2E=1` adds "E2E Burner" to the wallet picker, on any cluster but mainnet (`lib/solana/e2eBurnerWallet.ts`). It signs transactions and messages with the secret key stored in `localStorage` under `axel:e2e-burner-secret-key`, or creates one there, so a reload stays the same wallet. Each test stores a new key before the app loads and picks the burner in the wallet dialog, so every test has a wallet of its own. Never set `NEXT_PUBLIC_E2E` on a deployment.

**Isolation.** Nothing carries over between runs: a new ledger, new keys, a new backend database, and demo limits (3 access grants per IP address per day, one simulated month a minute) that live in the memory of the new dev server. Those limits also make the judge path one scenario per run, so `--repeat-each` does not apply to it. Retries are off; a red test is a bug to find, not to rerun.

**CI.** The `e2e` job in `.github/workflows/ci.yml` runs after the programs job, with the `axel_v2.so` that job built, the Agave CLI and Node 22. When it fails it uploads the Playwright report and the stack's logs as the `e2e-report` artifact.

**When it fails.** Every process logs to `frontend/e2e/.stack/logs/` (`validator`, `seed`, `backend`, `frontend`, …), which stays after the run. The ledger is deleted at the end of the run, or when the next run starts if it was interrupted. Playwright's HTML report is in `frontend/playwright-report/`, with a trace and screenshot of each failed test. Ctrl-C stops the whole stack. `next dev` writes to `frontend/.next`, so run `npm run build` again before `npm start`.

## Programs

Run from the repository root:

```bash
npm install                              # test and codegen dependencies
anchor build                             # target/deploy/*.so, target/idl, target/types
anchor test --provider.cluster localnet  # local validator + tests/**/*.ts
npm run lint                             # tsc --noEmit over tests/ and scripts/ (needs anchor build)
cargo test -p axel-v2                    # v2 math (unit + proptest), dates, telemetry chain, account layouts
npm run test:v2                          # v2 program on LiteSVM (needs anchor build; reinstalls tests-v2 deps when its lockfile changes)
npm run export-idl                       # copy target/idl/axel_v2.json and target/types/axel_v2.ts into frontend/src/lib/solana/idl-v2
npm run generate                         # regenerate sdk/axel-v2 from target/idl/axel_v2.json
npm --prefix sdk/axel-v2 ci && npm --prefix sdk/axel-v2 test   # generated client against the IDL
npx tsx scripts/init-project.ts --cluster devnet   # create a project; admin = ~/.config/solana/id.json
npm run test:seed                        # v2 demo seed unit tests (no validator)
npm run seed:validator                   # local validator with axel_v2 as upgradeable program (needs anchor build)
npm run seed -- --scale tiny             # seed it; needs DEMO_SEED_SECRET, see scripts/seed-devnet/README.md
```

`Anchor.toml` sets `[provider] cluster = "devnet"`, so a plain `anchor test` would deploy to devnet. Pass `--provider.cluster localnet` when running tests. The tests, `scripts/`, and the root `npm run lint` import from `target/`, which only exists after `anchor build`.

Program IDs (from `Anchor.toml`):

- `axel_v2`: `AXLcoEH3vJXUSL7nEr1T4d77NarThcbVrnbBzBR8XPZi` (not deployed yet; the keypair is kept outside the repository)
- `axel` (v1, devnet): `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`
- `transfer_hook` (v1, devnet): `5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`

## Pull requests

1. Branch from `main`.
2. Keep changes focused. Run the checks for the parts you touched (see above).
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
4. Never commit secrets, keypair JSON files, or `.env` / `.env.local` files.
5. Open the pull request against `main` and describe how you tested it.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
