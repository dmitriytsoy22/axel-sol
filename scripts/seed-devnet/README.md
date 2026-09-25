# Demo seed for AXEL v2

`scripts/seed-devnet` fills a cluster running `axel_v2` with a **fictional** demo fleet. It creates tKZT, the program config, four demo parks, KYC-verified investors and cars in every project state. It then adds months of backfilled telemetry, attested revenue deposits, claims, share transfers, a failed raise with refunds and a share recovery. Everything is derived from a seed string, so a run can be repeated and resumed. It follows §4.4 of the v2 design and uses the committed IDL in `frontend/src/lib/solana/idl-v2/`.

Everything the seed creates is demo data. The parks are called "Demo Park …", the plates are `DEMO nnn rr`, the investors are labeled fictional, and every document carries `data_origin: "devnet-demo-seed"`. The share mints carry the same value in their token metadata. The economics are **assumptions**, listed in [`economics.ts`](economics.ts) and copied into every output, and they must be checked against real listings and parks before the pitch.

## What a run creates

| | tiny | small | full |
| :--- | ---: | ---: | ---: |
| Cars (operating / paused / closed / funded / fundraising / failed) | 1 / 1 / 1 / 1 / 1 / 1 | 3 / 1 / 1 / 1 / 1 / 1 | 16 / 1 / 1 / 2 / 3 / 1 |
| Investors (plus the desk and a recovery wallet) | 8 | 20 | 60 |
| Positions | 21 | 83 | 299 |
| Monthly revenue periods, including the car sale | 9 | 32 | 118 |
| Telemetry days | 245 | 942 | 3 564 |
| Transfers / claims | 3 / 11 | 12 / 96 | 40 / 124 |
| Steps (one transaction each) | 88 | 324 | 900 |

- **Operating cars** have 2 to 9 months of history before the anchor month. The history includes a winter dip and, on some cars, a month with an accident and repair downtime. Each month, the oracle records the daily telemetry in batches of up to 20 days. The operator then deposits the month's income, and the oracle co-signs the deposit (`report_hash` is the SHA-256 of the published P&L).
- **The paused car** has an accident in its last month and is paused.
- **The closed car** is sold one or two months before the anchor month. The sale price goes to the holders as a `Final` deposit, and then the admin closes the project.
- **Funded cars** sell out and wait for activation. The config allows 60 days for activation, so they are still waiting while judges look.
- **Cars still raising** are 30 / 65 / 90% sold (full scale), with deadlines 30, 45 and 60 days after the anchor date.
- **The failed car's** raise lasts 120 seconds and ends below the soft cap. It is then finalized, and half of its buyers take a refund.
- **The desk** buys a fifth of up to three operating cars. This is the inventory `/api/demo/shares` gives to judges. Those cars and the open raises accept DEMO investors. The first desk car is "Demo Fleet": its own operator and oracle keys are the ones the `simulate-month` route will hold.
- **The recovery example.** The admin proposes to move a lost wallet's shares in one operating car to a new wallet. After the config's one-hour recovery delay, anyone can execute it, and the new wallet claims the revenue that moved with the shares. The case file is published and its hash is on-chain.

Transfers and claims are spread over the months in calendar order. Some claims are paid out by the platform's autopay crank (claim-for) instead of the owner, and a transfer to a wallet without a position opens it in the same transaction.

## Run it on a local validator

```bash
anchor build -p axel_v2                          # target/deploy/axel_v2.so
npm run seed:validator                           # separate terminal: resets out/test-ledger
export DEMO_SEED_SECRET=$(openssl rand -hex 32)  # keep it; the same secret gives the same keys
npm run seed -- --cluster localnet --scale tiny  # about 2 minutes
npm run seed:verify -- --cluster localnet        # I1–I5 for every project on the cluster
```

`seed:validator` loads the program with `--upgradeable-program`, and your wallet (`~/.config/solana/id.json`, or `--payer`) is the upgrade authority. `--bpf-program` would not work: it loads the program without an upgrade authority, and `initialize_config` only accepts the upgrade authority as signer.

The recovery can only execute one hour after it is proposed, so the first run stops before it and prints when to come back. Run the same command again after that time, or pass `--wait`. On localnet the master wallet gets an airdrop if it holds less than the budget.

Several plans can share one validator (for example tiny and then small) if each has its own state and output file: `--state scripts/seed-devnet/out/seed-state.localnet-small.json --out scripts/seed-devnet/out/localnet-small.json`. They share the platform roles and the config, and each has its own investors and cars.

## Run it on devnet

1. Deploy `axel_v2` with the founder's wallet as upgrade authority (see `docs/v2.md`).
2. Check the SOL budget. This only reads rent from the cluster and sends nothing:
   ```bash
   npm run seed -- --cluster devnet --scale full --dry-run --site-url https://<the deployed site>
   ```
3. Seed. A dedicated RPC (Helius, QuickNode) is better than the rate-limited public one:
   ```bash
   DEMO_SEED_SECRET=... npm run seed -- --cluster devnet --scale full --site-url https://<site> --rpc <url>
   ```
4. After an hour, run the same command again to execute the recovery. Then commit `frontend/public/demo-data/` and `scripts/seed-devnet/out/devnet.json`. `seed-state.devnet.json` and `invariants.devnet.json` can be committed too.

The master wallet pays for everything and funds each derived role with exactly its share of the budget, plus 0.01 SOL of headroom. The investor wallets never hold SOL; the master wallet pays their fees and rent.

## SOL budget

`--dry-run` prices the plan with the cluster's live rent. On devnet (5 080 lamports per byte on 2026-09-25, share mints priced with the 200-character URI cap):

| | tiny | small | full |
| :--- | ---: | ---: | ---: |
| Peak spend | 0.192 SOL | 0.464 SOL | 1.531 SOL |
| Locked after the run | 0.185 SOL | 0.455 SOL | 1.503 SOL |
| Master wallet needs (peak plus role headroom) | 0.272 SOL | 0.554 SOL | 1.621 SOL |

At full scale most of it is holders' accounts: 299 positions (0.38 SOL) and their share accounts (0.46 SOL). Deploying the program is separate, at about 4.12 SOL plus a temporary buffer of the same size (see `docs/v2.md`).

## Flags

| Flag | Default | |
| :--- | :--- | :--- |
| `--cluster localnet\|devnet` | `localnet` | mainnet is refused |
| `--scale tiny\|small\|full` | `small` | |
| `--dry-run` | | prints the plan, the assumptions and the SOL budget priced with the cluster's live `getMinimumBalanceForRentExemption`; needs no secret |
| `--only <phases>` | all | comma-separated: `setup`, `investors`, `raise`, `months`, `lifecycle`, `recovery`, `publish`, `verify` |
| `--seed <text>` | `axel-demo-2026` | the plan's random seed |
| `--anchor-date YYYY-MM-DD` | today, then pinned in the state file | reported months end the month before it |
| `--site-url <url>` | `http://localhost:3000` on localnet, required on devnet | token metadata URIs point to `<site>/demo-data/<mint>/metadata.json` |
| `--data-dir <dir>` | `frontend/public/demo-data` on devnet, `out/localnet/demo-data` on localnet | where the published files go |
| `--rpc <url>` | local validator or public devnet | |
| `--program-id <id>` | the IDL's address | |
| `--payer <path>` | `~/.config/solana/id.json` | the master wallet: upgrade authority and payer |
| `--state <path>`, `--out <path>` | `out/seed-state.<cluster>.json`, `out/<cluster>.json` | |
| `--wait` | | wait for time-locked steps instead of stopping; waits of up to 5 minutes happen anyway |

Paths on the command line are relative to the directory you run `npm` from.

## Keys

Every key is derived with HKDF-SHA256 from `DEMO_SEED_SECRET` (salt `axel/seed-devnet/v1`, see [`lib/keys.ts`](lib/keys.ts)). The secret is never written anywhere. Anyone who has it controls the demo roles, and without it the roles of an existing seed cannot be used again.

- **Per cluster:** `admin`, `kyc`, `demo-kyc` (the config's demo KYC key), `treasury`, `faucet` (tKZT mint authority), `tkzt-mint`, `oracle`, `demo-operator`, `demo-oracle`, `operator:<park>` and `desk`.
- **Per run** (cluster, seed and scale): the investors, the recovery wallet and the share mints.

`out/<cluster>.json` lists every public key. The demo route handlers can derive the same keys from the same secret.

## How a run stays idempotent

The plan ([`plan.ts`](plan.ts)) is a pure function of the seed, the scale and the anchor date. The same inputs always give the same steps. [`execute.ts`](execute.ts) turns each step into one transaction:

1. It signs the transaction and writes the signature to the state file as `pending`.
2. It sends the transaction and waits until it is confirmed, fails or expires.
3. It marks the step `done`.

After a crash, a pending signature is looked up on the cluster. The step is only sent again if its blockhash expired without it landing, so no step ever runs twice. Steps that find their work already done on-chain (the config, the tKZT mint, funded roles) are skipped with a note. The state file also pins the plan's hash, so a run is never resumed with a different plan.

Before each deposit, the executor checks that the on-chain telemetry head equals the head in the report it is about to attest.

## Outputs

- **`out/<cluster>.json`**: every address of the run: config, tKZT, roles, parks, cars (mint, project, vaults, operator, oracle, state), investors, the recovery request, and the assumptions.
- **`out/seed-state.<cluster>.json`**: the executor's checkpoint, with every step's signature.
- **`out/invariants.<cluster>.json`**: the last invariant report.
- **`<data-dir>/<mint>/`**: the files the app's "Verify" button checks:
  - `index.json`: the car, the assumption-based figures of the car, the list of published months, reports and their transactions;
  - `metadata.json`: the token metadata JSON the share mint's URI points to;
  - `telemetry/<yyyy-mm>.json`: each day's raw record, its `data_hash` and the chain head after it;
  - `reports/<yyyy-mm>.json` and `reports/<yyyy-mm>-sale.json`: the P&L whose hash is the period's `report_hash`;
  - `acquisition.json`: the purchase document whose hash is the project's `acquisition_doc_hash`;
  - `recovery/case.json`: the recovery case file.

  Only data whose transactions are confirmed is published.

Hashes are SHA-256 of the RFC 8785 canonical JSON ([`lib/jcs.ts`](lib/jcs.ts)). The telemetry chain is the program's `head' = sha256(head ‖ date as u32 LE ‖ data_hash)`, starting from 32 zero bytes. Telemetry status codes are the backend oracle's ([docs/api.md](../../docs/api.md#telemetry-what-is-published)): 1 rented out, 2 no driver, 3 scheduled service, 4 accident repair.

On localnet, the outputs are git-ignored. On devnet they are meant to be committed.

## Verification

At the end of every run (`--only verify` runs just this):

1. **Proof of solvency** ([`verify-invariants.ts`](verify-invariants.ts), also `npm run seed:verify`) reads every project of the program from the chain and checks I1–I5:
   - I1: owed to holders ≤ deposited − claimed ≤ revenue vault;
   - I2: supply = sold − refunded − retired = Σ positions;
   - I3: every thawed share account is its owner's canonical account and holds exactly the position, and frozen accounts hold nothing;
   - I4: escrow = (sold − refunded) × price until activation closes it;
   - I5: no checkpoint is ahead of the accumulator.

   It exits with an error if any project fails, or if there are no projects.
2. **Published data** ([`verify-published.ts`](verify-published.ts)): reading only the published files, it recomputes every record hash, the telemetry chains, the report and acquisition hashes. It compares them with the project heads, the revenue periods and the activation hash on-chain.
3. **Plan comparison** ([`expectations.ts`](expectations.ts)), once every step is done: every project's state, totals and telemetry head, and every position's shares, claims, pending revenue and paid-in amount, must equal the plan's BigInt ledger model ([`lib/ledger.ts`](lib/ledger.ts)).
4. **Budget check**: the SOL the master wallet and the roles spent on the run is compared with the dry-run estimate. It is exact only for a run that had the cluster to itself and was never killed: a killed invocation cannot record what it spent, and accounts shared with earlier runs are not paid again.

`npm run test:seed` runs the unit tests: canonical JSON against RFC 8785's examples, the telemetry chain against the program's reference vectors, key derivation, the plan's determinism, chronology and raise math, the economics bounds, the budget, the ledger model and the invariant checks. No validator is needed.

## Choices beyond the spec

- **Deadlines of open raises are 30, 45 and 60 days after the anchor date**, not October 10–31. The judge path starts with buying into an open raise, and raises that end on October 31 would be over before judging is done.
- **The failed raise lasts 120 seconds**, not 90, so its purchases fit even on a slow RPC.
- **Config:** 2% raise fee, 5% revenue fee (the program caps them at 5% and 20%), 60-second minimum raise, 60-day activation window, and the program's minimum recovery delay of 1 hour. Mainnet needs at least 72 hours.
- **tKZT is an SPL Token with 6 decimals** and no freeze authority, so it can never freeze a vault.
- **The faucet mints each month's income to the operator** in the same transaction as the deposit. It stands in for the drivers' rent payments.
- **One oracle key attests every car** except Demo Fleet, which has its own oracle key so the web server never holds the main one.
- **Telemetry is batched by month** (at most 20 days per transaction). Each deposit then commits to the telemetry head at the end of its month.
