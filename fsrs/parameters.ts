/**
 * FSRS-7 default parameters from open-spaced-repetition/fsrs-rs (commit
 * 0a5737406a0c5c7a5259b144738cbe4a0b649d76).
 * Algorithm transcription independently checked against the MIT-licensed
 * kutyel/haskell-fsrs reference (commit c26a0ac65b69bbb771603aa9ff720cd6fb780af5).
 */
export const FSRS_VERSION = 'fsrs-7-vutadex-1' as const;
export const DEFAULT_PARAMETERS: readonly number[] = Object.freeze([
  0.1104, 2.2395, 3.9221, 11.7841, 6.1686, 0.6457, 3.6807,
  1.9795, 0, 1.3826, 0.7024, 0.5999, 0.8146, 0.6398, 1,
  1.3207, 0.6707, 3.8668, 0.4416, 0.0934, 1.8631, 0.6162, 1.0869,
  0.1567, 0.0801, 0.2421, 0.9464, 0.1433, 0.7145, 0, 0.5667,
  0.3734, 0.5333, 0.3048
]);
const BOUNDS: ReadonlyArray<readonly [number, number]> = [
  [0.0001, 50], [0.0001, 100], [0.0001, 100], [0.0001, 100],
  [1, 10], [0.001, 4], [0.1, 4],
  [0, 4], [0, 1.2], [0.3, 3], [0.01, 1.5], [0.1, 1], [0, 3.5], [0, 1], [1, 7],
  [0, 4], [0, 2], [0.5, 6], [0.001, 1.5], [0.001, 1], [0, 5], [0, 1], [1, 7],
  [0.01, 0.25], [0.01, 0.95], [0.2, 0.85], [0.5, 0.99],
  [0.01, 1], [0.1, 1], [0, 0.9], [0.1, 1.1],
  [0, 1], [0, 0.6], [0, 0.6]
];
export function validateParameters(weights: readonly number[]): void {
  if (weights.length !== 34) throw new RangeError('FSRS-7 requires 34 parameters.');
  for (let i = 0; i < weights.length; i++) {
    const value = weights[i]!;
    const [min, max] = BOUNDS[i]!;
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new RangeError(`Invalid FSRS-7 parameter ${i}.`);
    }
  }
  for (const [a, b] of [[0, 1], [1, 2], [2, 3], [25, 26]]) {
    if (weights[a]! > weights[b]!) throw new RangeError('FSRS-7 parameter ordering violated.');
  }
}
validateParameters(DEFAULT_PARAMETERS);
