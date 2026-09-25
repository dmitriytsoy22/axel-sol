# AXEL Documentation

| Document | Contents |
|---|---|
| [product.md](product.md) | What AXEL is on v2, users, the user flow, business model, what the program enforces and what is trusted, MVP limits, and the v1 product |
| [architecture.md](architecture.md) | Components, deployment status, roles and keys, the `axel_v2` program in summary, the oracle, KYC and indexer flows, frontend routes, demo seed, tests, security properties, known limitations, and the legacy v1 programs |
| [v2.md](v2.md) | The `axel_v2` program in full: share and payment mints, accounts and seeds, every instruction and its checks, the state machine, the transfer hook, revenue math, recovery governance, revenue attestation, limits, v1 limitation → v2 fix, the test matrix, build and deploy |
| [api.md](api.md) | Backend HTTP endpoints and configuration, frontend environment, published car data, judge demo routes, Solana Actions, the `axel_v2` instruction, account, event and error reference, the TypeScript clients, and the v1 reference |
| [roadmap.md](roadmap.md) | What exists (pre-hackathon baseline and Crypto World's Fair work), what is blocked, and next steps |
| [../scripts/seed-devnet/README.md](../scripts/seed-devnet/README.md) | The demo seed: what a run creates, keys, SOL budget, outputs and verification |
| [../programs/axel-v2/README.md](../programs/axel-v2/README.md) | What the admin can and cannot do, share recovery, mainnet requirements |
| [planning/](planning/) | Historical specification and team plans (Mar–Apr 2026), with a table of where they differ from the code |
| [ru/](ru/) | Russian-language material kept for the team: the v1 project overview and the pre-hackathon frontend task and prompt lists |

Everything in these documents was checked against the code in this repository. Devnet state was checked on 2026-09-24; `axel_v2` is not deployed yet.
