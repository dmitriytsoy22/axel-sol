/** Deterministic pseudo-random numbers (mulberry32), so a failing sequence can be replayed. */
export function prng(seed: number): (below: bigint) => bigint {
  let state = seed >>> 0;
  const next32 = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let x = state;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return BigInt((x ^ (x >>> 14)) >>> 0);
  };
  return (below) => ((next32() << 32n) | next32()) % below;
}
