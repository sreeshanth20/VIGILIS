/**
 * AEGIS ML Core — Seeded pseudo-random number generator.
 *
 * Deterministic, reproducible RNG so the entire pipeline (data generation,
 * train/val/test split, bootstrap sampling) is fully reproducible from a seed.
 *
 * Algorithm: mulberry32 — fast, well-distributed 32-bit PRNG.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Ensure a non-zero state (mulberry32 requires non-zero seed)
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  /** Next uint32. */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Float in [0, 1). */
  uniform(): number {
    return this.next() / 4294967296;
  }

  /** Float in [min, max). */
  uniformRange(min: number, max: number): number {
    return min + this.uniform() * (max - min);
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + (this.next() % (max - min + 1));
  }

  /** Pick a random element from an array. */
  pick<T>(arr: readonly T[]): T {
    return arr[this.next() % arr.length];
  }

  /** Standard normal via Box-Muller. */
  normal(mean = 0, std = 1): number {
    const u1 = Math.max(this.uniform(), 1e-12);
    const u2 = this.uniform();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }

  /** Bernoulli trial with probability p. */
  bernoulli(p: number): boolean {
    return this.uniform() < p;
  }

  /** Shuffle a mutable array in place (Fisher-Yates). */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.next() % (i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}
