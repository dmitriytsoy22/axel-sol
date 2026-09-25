# axel_v2

The v2 program of AXEL in one Anchor program:

- escrowed raises with refunds;
- a KYC registry;
- a transfer hook that keeps a ledger of every holder's shares;
- revenue deposits attested by the fleet's oracle, and claims;
- a telemetry hash chain;
- time-locked share recovery.

Tests: `cargo test -p axel-v2` (math, layouts) and `npm run test:v2` (the program on LiteSVM, in [`tests-v2/`](../../tests-v2)).

## What the admin can and cannot do

The admin can:

- create projects, pause and resume them, and close them;
- change the operator and the oracle of a running project;
- cancel a raise before activation, which opens refunds;
- update the config: fees for new projects, raise windows, allowed payment mints, the global pause, the KYC keys and the recovery delay;
- propose a share recovery, which runs only after the recovery delay and only if the affected owner does not veto it.

The admin cannot:

- take money out of an escrow or a revenue vault. The escrow goes to the operator on activation or back to buyers as refunds, and the revenue vault pays holders only;
- raise fees above the hard caps (5% of a raise, 20% of revenue) or change the fees of an existing project;
- move or burn shares directly. No human key holds any authority over a share mint: mint authority, freeze authority, permanent delegate and metadata update authority are the project PDA, and the hook and metadata pointer have no authority.

## Share recovery

Recovery gets a holder's shares back when it loses its wallet, or passes them to its heirs:

1. **Propose.** The admin calls `propose_recovery`. It names the old wallet, the new wallet, the number of shares and the SHA-256 of the off-chain case file (the holder's request and identity evidence).
   - The new wallet needs an active KYC record the project accepts.
   - The request is a PDA `["recovery", project, old wallet]` with `eta = now + recovery_delay`. A later change of the delay does not move it.
   - Both wallets are accounts of the transaction, so the proposal shows up in the old wallet's history.
2. **Veto.** Until `eta` the old wallet can cancel the request with `cancel_recovery`. The admin can withdraw it at any time before it runs.
3. **Execute.** From `eta` anyone can call `execute_recovery`:
   - it settles the revenue of both positions;
   - it burns the shares from the old wallet, signed by the project PDA as permanent delegate, and mints the same number to the new wallet's canonical share account, so the supply never changes;
   - it moves the old wallet's unclaimed revenue along, pro rata to the shares moved.

Recovery never touches a wallet under a sanctions freeze, and the global pause stops proposals and execution but never a veto. It works in every project state, so a lost key cannot strand a refund of a failed raise or the sale proceeds of a closed project.

A stolen key can veto as well. Recovery is meant for lost keys and inheritance, not for theft.

## Mainnet requirements

The program enforces a recovery delay of 1 hour to 30 days, so that a devnet demo can run a recovery from start to end. A mainnet deployment must also meet these requirements:

- **`recovery_delay` of at least 72 hours** (259 200 seconds), so that owners have time to notice and veto a proposal.
- **The config `admin` is a Squads multisig**, for example 2-of-3 with an independent signer. Hand it over with `propose_admin` and `accept_admin`.
- **The program's upgrade authority is a Squads multisig as well.** An upgrade can replace every rule above.
