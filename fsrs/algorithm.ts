import { DEFAULT_PARAMETERS } from './parameters.ts';

export type Rating = 1 | 2 | 3 | 4;
export type MemoryState = { stability: number; difficulty: number; fastStability: number };
export type FSRSParameters = readonly number[];

const MIN_STABILITY = 1e-4;
const MAX_STABILITY = 36500;
const MIN_INTERVAL = 1 / 86400;
const MAX_INTERVAL = 36500;
const FLOOR = 1e-5;
const FAST_RATIO = 0.8;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const stability = (s: number): number => clamp(s, MIN_STABILITY, MAX_STABILITY);
const difficulty = (d: number): number => clamp(d, 1, 10);

function assertState(state: MemoryState): void {
  if (![state.stability, state.difficulty, state.fastStability].every(Number.isFinite)) {
    throw new RangeError('Memory state must be finite.');
  }
}
function assertRating(rating: number): asserts rating is Rating {
  if (![1, 2, 3, 4].includes(rating)) throw new RangeError('Rating must be 1, 2, 3 or 4.');
}
function assertElapsed(days: number): void {
  if (!Number.isFinite(days) || days < 0) throw new RangeError('Elapsed days must be finite and nonnegative.');
}

/** FSRS-7 two-trace mixture recall probability, [1e-5, 1-1e-5]. */
export function retrievability(
  state: MemoryState, elapsedDays: number, w: FSRSParameters = DEFAULT_PARAMETERS
): number {
  assertState(state);
  assertElapsed(elapsedDays);
  const s = stability(state.stability);
  const sf = stability(state.fastStability);
  const d = difficulty(state.difficulty);
  const decay1 = -clamp(w[23]! * sf ** (w[33]! - 0.3), 0.01, 0.95);
  const rate1 = (Math.exp(Math.min(60, Math.log(w[25]!) / decay1)) - 1) / sf;
  const decay2 = -clamp(w[24]!, 0.01, 0.95);
  const rate2 = (w[26]! ** (1 / decay2) - 1) * Math.exp((d - 5) * (w[32]! - 0.3)) / s;
  const weight1 = w[27]! * sf ** -w[29]!;
  const weight2 = w[28]! * s ** w[30]! * Math.exp((d - 5) * (w[31]! - 0.5));
  const r1 = (1 + rate1 * elapsedDays) ** decay1;
  const r2 = (1 + rate2 * elapsedDays) ** decay2;
  return (weight1 * r1 + weight2 * r2) / (weight1 + weight2) * (1 - 2 * FLOOR) + FLOOR;
}

export function fastRetrievability(
  fastStability: number, elapsedDays: number, w: FSRSParameters = DEFAULT_PARAMETERS
): number {
  if (!Number.isFinite(fastStability)) throw new RangeError('Invalid fast stability.');
  assertElapsed(elapsedDays);
  const sf = stability(fastStability);
  const decay = -clamp(w[23]! * sf ** (w[33]! - 0.3), 0.01, 0.95);
  const rate = (Math.exp(Math.min(60, Math.log(w[25]!) / decay)) - 1) / sf;
  return (1 + rate * elapsedDays) ** decay;
}

export function initialMemoryState(rating: Rating, w: FSRSParameters = DEFAULT_PARAMETERS): MemoryState {
  assertRating(rating);
  const s = stability(w[rating - 1]!);
  const rawDifficulty = w[4]! - Math.exp(w[5]! * (rating - 1)) + 1;
  return { stability: s, difficulty: difficulty(rawDifficulty), fastStability: stability(FAST_RATIO * s) };
}

function traceAfterReview(
  w: FSRSParameters, offset: 7 | 15, s0: number, d: number, r: number, rating: Rating
): number {
  const s = stability(s0);
  const failureStability =
    w[offset + 3]! * ((s + 1) ** w[offset + 4]! - 1)
    * Math.exp((1 - r) * w[offset + 5]!);
  const postLapse = Math.min(s, failureStability);
  if (rating === 1) return stability(postLapse);
  const hardPenalty = rating === 2 ? w[offset + 6]! : 1;
  const easyBonus = rating === 4 ? w[offset + 7]! : 1;
  const increase = 1 + Math.exp(w[offset]! - 1.5) * (11 - d)
    * s ** -w[offset + 1]! * (Math.exp((1 - r) * w[offset + 2]!) - 1)
    * hardPenalty * easyBonus;
  return stability(Math.max(postLapse, s * increase));
}

/** Pure FSRS-7 memory transition. The initial review ignores elapsedDays. */
export function nextMemoryState(
  before: MemoryState | null, elapsedDays: number, rating: Rating,
  w: FSRSParameters = DEFAULT_PARAMETERS
): MemoryState {
  assertRating(rating);
  assertElapsed(elapsedDays);
  if (before === null) return initialMemoryState(rating, w);
  assertState(before);
  const d = difficulty(before.difficulty);
  const r = retrievability(before, elapsedDays, w);
  const slow = traceAfterReview(w, 7, before.stability, d, r, rating);
  const rawFast = traceAfterReview(w, 15, before.fastStability, d,
    fastRetrievability(before.fastStability, elapsedDays, w), rating);
  const fast = rating === 1 ? Math.min(rawFast, FAST_RATIO * slow) : rawFast;
  const step = -w[6]! * (rating - 3);
  const delta = rating === 1 ? step * (r + 0.1) : step;
  const damped = d + delta * (10 - d) / 9;
  const rawEasy = w[4]! - Math.exp(w[5]! * 3) + 1;
  return {
    stability: stability(slow),
    difficulty: difficulty(0.01 * rawEasy + 0.99 * damped),
    fastStability: stability(fast)
  };
}

/** Monotone root finding in log(days); interval precision better than 1e-9 relative. */
export function nextIntervalDays(
  state: MemoryState, targetRetention = 0.9, w: FSRSParameters = DEFAULT_PARAMETERS
): number {
  assertState(state);
  if (!Number.isFinite(targetRetention) || targetRetention <= 0 || targetRetention > 1) {
    throw new RangeError('Desired retention must be > 0 and <= 1.');
  }
  if (retrievability(state, MIN_INTERVAL, w) <= targetRetention) return MIN_INTERVAL;
  if (retrievability(state, MAX_INTERVAL, w) >= targetRetention) return MAX_INTERVAL;
  let low = Math.log(MIN_INTERVAL);
  let high = Math.log(MAX_INTERVAL);
  for (let i = 0; i < 160; i++) {
    const mid = (low + high) / 2;
    if (retrievability(state, Math.exp(mid), w) > targetRetention) low = mid;
    else high = mid;
  }
  return Math.exp((low + high) / 2);
}

export function replayReviews(
  history: readonly { elapsedDays: number; rating: Rating }[],
  w: FSRSParameters = DEFAULT_PARAMETERS
): MemoryState | null {
  let state: MemoryState | null = null;
  for (const review of history) state = nextMemoryState(state, review.elapsedDays, review.rating, w);
  return state;
}
