/**
 * A BigInt copy of the program's ledger math (`programs/axel-v2/src/math.rs` and the
 * instruction handlers that use it). The planner runs every step through it to know what
 * each holder can claim and may transfer, and the executor compares the chain with it.
 */

const Q = 64n;
const BPS = 10_000n;

export interface PositionModel {
  shares: bigint;
  checkpoint: bigint;
  accrued: bigint;
  claimed: bigint;
  paidIn: bigint;
}

export class ProjectLedger {
  acc = 0n;
  sold = 0n;
  refunded = 0n;
  depositedNet = 0n;
  fees = 0n;
  claimed = 0n;
  readonly positions = new Map<string, PositionModel>();

  constructor(
    readonly pricePerShare: bigint,
    readonly revenueFeeBps: bigint,
  ) {}

  supply(): bigint {
    return this.sold - this.refunded;
  }

  has(owner: string): boolean {
    return this.positions.has(owner);
  }

  position(owner: string): PositionModel {
    const position = this.positions.get(owner);
    if (position === undefined) {
      throw new Error(`no position for ${owner}`);
    }
    return position;
  }

  /** `open_position` and the first purchase start at the current accumulator. */
  open(owner: string): PositionModel {
    let position = this.positions.get(owner);
    if (position === undefined) {
      position = { shares: 0n, checkpoint: this.acc, accrued: 0n, claimed: 0n, paidIn: 0n };
      this.positions.set(owner, position);
    }
    return position;
  }

  private settle(position: PositionModel): void {
    position.accrued += (position.shares * (this.acc - position.checkpoint)) >> Q;
    position.checkpoint = this.acc;
  }

  pending(owner: string): bigint {
    const position = this.positions.get(owner);
    if (position === undefined) {
      return 0n;
    }
    return position.accrued + ((position.shares * (this.acc - position.checkpoint)) >> Q);
  }

  buy(owner: string, shares: bigint): bigint {
    const cost = shares * this.pricePerShare;
    const position = this.open(owner);
    position.shares += shares;
    position.paidIn += cost;
    this.sold += shares;
    return cost;
  }

  deposit(gross: bigint): { fee: bigint; net: bigint } {
    const fee = (gross * this.revenueFeeBps) / BPS;
    const net = gross - fee;
    this.acc += (net << Q) / this.supply();
    this.depositedNet += net;
    this.fees += fee;
    return { fee, net };
  }

  claim(owner: string): bigint {
    const position = this.position(owner);
    this.settle(position);
    const amount = position.accrued;
    position.accrued = 0n;
    position.claimed += amount;
    this.claimed += amount;
    return amount;
  }

  /** A share transfer through the hook: both sides settle, then the shares move. */
  transfer(from: string, to: string, shares: bigint): void {
    const source = this.position(from);
    const destination = this.position(to);
    if (source.shares < shares) {
      throw new Error(`${from} holds ${source.shares} shares, cannot send ${shares}`);
    }
    this.settle(source);
    this.settle(destination);
    source.shares -= shares;
    destination.shares += shares;
  }

  refund(owner: string): bigint {
    const position = this.position(owner);
    const amount = position.shares * this.pricePerShare;
    this.refunded += position.shares;
    position.shares = 0n;
    return amount;
  }

  /** `execute_recovery`: the unclaimed revenue moves pro rata to the shares moved. */
  recover(from: string, to: string, shares: bigint): bigint {
    const source = this.position(from);
    const destination = this.open(to);
    this.settle(source);
    const accruedMoved = (source.accrued * shares) / source.shares;
    source.shares -= shares;
    source.accrued -= accruedMoved;
    this.settle(destination);
    destination.shares += shares;
    destination.accrued += accruedMoved;
    return accruedMoved;
  }
}
