/** The judge's path through the demo, in order (docs/api.md, "Judge demo API"). */
export const DEMO_STEPS = [
  'access',
  'buy',
  'shares',
  'simulate',
  'claim',
  'verify',
  'solvency',
] as const;
export type DemoStep = (typeof DEMO_STEPS)[number];

export type StepState = 'done' | 'current' | 'upcoming';

/** What the chain says about the connected wallet, as far as the demo path cares. */
export interface DemoWalletState {
  /** An active, unexpired KYC record that demo cars accept. */
  verified: boolean;
  /** It paid into a raise at some point (a position with `paid_in`). */
  boughtInRaise: boolean;
  /** Its position in the demo fleet car. */
  fleetShares: bigint;
  fleetPending: bigint;
  fleetClaimed: bigint;
}

/**
 * Which steps are done, and the one to do next. A step's evidence is on-chain, so the path
 * picks up where the wallet left off, on any device. The last two steps are checks to read,
 * never "done".
 */
export function demoProgress(wallet: DemoWalletState): Record<DemoStep, StepState> {
  const done: Record<DemoStep, boolean> = {
    access: wallet.verified,
    buy: wallet.boughtInRaise,
    shares: wallet.fleetShares > 0n || wallet.fleetClaimed > 0n,
    simulate: wallet.fleetPending > 0n || wallet.fleetClaimed > 0n,
    claim: wallet.fleetClaimed > 0n,
    verify: false,
    solvency: false,
  };
  const current = DEMO_STEPS.find((step) => !done[step]);
  return Object.fromEntries(
    DEMO_STEPS.map((step) => [
      step,
      done[step] ? 'done' : step === current ? 'current' : 'upcoming',
    ]),
  ) as Record<DemoStep, StepState>;
}
