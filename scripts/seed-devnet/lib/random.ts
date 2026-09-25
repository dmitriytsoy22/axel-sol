import { createHash } from "node:crypto";

/**
 * Deterministic pseudo-random numbers (sfc32). Every stream is derived from the plan seed
 * and a label, so adding a car or an investor does not reshuffle the data of the others.
 * Only integer arithmetic and additions of doubles are used, so a plan is identical on
 * every platform and Node version.
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  private constructor(state: Uint32Array) {
    [this.a, this.b, this.c, this.d] = state;
    for (let i = 0; i < 12; i++) {
      this.nextU32();
    }
  }

  static stream(seed: string, ...labels: Array<string | number>): Rng {
    const digest = createHash("sha256").update([seed, ...labels].join("\u0000")).digest();
    return new Rng(new Uint32Array(digest.buffer, digest.byteOffset, 4).slice());
  }

  nextU32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    return this.nextU32() / 4_294_967_296;
  }

  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new Error(`invalid integer range [${min}, ${max}]`);
    }
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniform in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("cannot pick from an empty list");
    }
    return items[this.int(0, items.length - 1)];
  }

  /** Index drawn with probability proportional to its weight. */
  weightedIndex(weights: readonly number[]): number {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (!(total > 0)) {
      throw new Error("weights must have a positive sum");
    }
    let target = this.next() * total;
    for (let i = 0; i < weights.length; i++) {
      target -= weights[i];
      if (target < 0) {
        return i;
      }
    }
    return weights.length - 1;
  }

  /** Approximately normal (Irwin-Hall sum of 12 uniforms), clamped to [min, max]. */
  normalInt(mean: number, sd: number, min: number, max: number): number {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += this.next();
    }
    return Math.min(max, Math.max(min, Math.round(mean + (sum - 6) * sd)));
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** `count` distinct items, each drawn with probability proportional to its weight. */
  weightedSample<T>(items: readonly T[], weights: readonly number[], count: number): T[] {
    if (count > items.length) {
      throw new Error(`cannot draw ${count} distinct items from ${items.length}`);
    }
    const pool = items.map((item, i) => ({ item, weight: weights[i] }));
    const chosen: T[] = [];
    while (chosen.length < count) {
      const index = this.weightedIndex(pool.map((entry) => entry.weight));
      chosen.push(pool[index].item);
      pool.splice(index, 1);
    }
    return chosen;
  }
}
