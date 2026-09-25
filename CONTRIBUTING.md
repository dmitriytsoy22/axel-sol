# Contributing to AXEL

Issues and pull requests are welcome. For security problems, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

## Repository layout

| Path | What it is |
| :--- | :--- |
| `programs/axel`, `programs/transfer-hook` | v1 Anchor programs, kept as legacy (Token-2022 mint, sale, revenue, whitelist, telemetry; transfer hook) |
| `programs/axel-v2` | v2 Anchor program: escrowed raise, KYC registry, revenue accumulator, transfer hook in one program |
| `tests/` | v1 program tests (`node:test`) run against a local validator at `http://127.0.0.1:8899` |
| `tests-v2/` | v2 program tests (`node:test`) on LiteSVM, with their own `package.json` |
| `scripts/` | `init-project.ts` (creates a project on a cluster), `generate-clients.ts` (Codama SDK into `sdk/generated`) |
| `backend/` | NestJS service: Yandex Fleet telemetry oracle and Sumsub KYC webhook |
| `frontend/` | Next.js 14 app |

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
npm run lint                        # next lint
npx tsc --noEmit                    # type check
npm run build                       # production build
```

The program IDL is vendored in `frontend/src/lib/solana/idl/` (`axel.json`, `axel.ts`), so the frontend builds without an Anchor toolchain. If you change the program interface, run `anchor build` and copy `target/idl/axel.json` and `target/types/axel.ts` there.

## Backend

```bash
cd backend
npm install
cp .env.example .env
npm run start:dev     # watch mode; GET http://localhost:3001/health
npm run build         # compile to dist/
npm run start:prod    # node dist/main
npx tsc --noEmit      # type check
```

Without Yandex Fleet credentials the telemetry job uses simulated data. `backend/.env.example` documents every variable the backend reads.

## Programs

Run from the repository root:

```bash
npm install                              # test and codegen dependencies
anchor build                             # target/deploy/*.so, target/idl, target/types
anchor test --provider.cluster localnet  # local validator + tests/**/*.ts
npm run lint                             # tsc --noEmit over tests/ and scripts/ (needs anchor build)
cargo test -p axel-v2                    # v2 math (unit + proptest) and account layouts
npm run test:v2                          # v2 program on LiteSVM (needs anchor build; reinstalls tests-v2 deps when its lockfile changes)
npm run generate                         # regenerate sdk/generated from target/idl/axel.json
npx tsx scripts/init-project.ts --cluster devnet   # create a project; admin = ~/.config/solana/id.json
```

`Anchor.toml` sets `[provider] cluster = "devnet"`, so a plain `anchor test` would deploy to devnet. Pass `--provider.cluster localnet` when running tests. The tests, `scripts/`, and the root `npm run lint` import from `target/`, which only exists after `anchor build`.

Deployed devnet program IDs (from `Anchor.toml`):

- `axel`: `DJMyW18aG1g48c534cC2VsaQh15pPan2tMBDkhyhQX1M`
- `transfer_hook`: `5s4m6MbjqjhEeFVKwKXMDR2cXWT7crz5AbgtZeLwCbdJ`

## Pull requests

1. Branch from `main`.
2. Keep changes focused. Run the checks for the parts you touched (see above).
3. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
4. Never commit secrets, keypair JSON files, or `.env` / `.env.local` files.
5. Open the pull request against `main` and describe how you tested it.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
