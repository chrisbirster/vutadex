import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextMemoryState, retrievability, nextIntervalDays, replayReviews,
  initialMemoryState
} from '../fsrs/algorithm.ts';
import { DEFAULT_PARAMETERS, validateParameters } from '../fsrs/parameters.ts';

function near(a: number, b: number, tol = 1e-9): void {
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `expected ${b}, got ${a}`);
}

// Independent golden vectors from kutyel/haskell-fsrs, commit c26a0ac65,
// test/Test/FSRS/GoldenData.hs (MIT license).
test('FSRS-7 defaults and golden initial memories', () => {
  assert.equal(DEFAULT_PARAMETERS.length, 34);
  validateParameters(DEFAULT_PARAMETERS);
  const expected = [
    [0.1104, 6.1686, 0.08832000000000001],
    [2.2395, 5.261278312731786, 1.7916],
    [3.9221, 3.5307239812763354, 3.13768],
    [11.7841, 1, 9.427280000000001]
  ];
  for (const [index, triple] of expected.entries()) {
    const s = initialMemoryState((index + 1) as 1 | 2 | 3 | 4);
    near(s.stability, triple[0]!); near(s.difficulty, triple[1]!); near(s.fastStability, triple[2]!);
  }
  assert.throws(() => validateParameters([...DEFAULT_PARAMETERS, 1]));
});

test('golden retrievability for same-day and long-term intervals', () => {
  const cases = [
    [0.006944444444444444, 0.5, 5, 0.4, 0.8743808379004029],
    [0.25, 1, 5, 0.8, 0.8668414387176168],
    [1, 3.9221, 5, 3.13768, 0.9235541232818624],
    [7.5, 3.9221, 5, 3.13768, 0.8585903549106019]
  ];
  for (const [days, stability, difficulty, fastStability, answer] of cases) {
    near(retrievability({ stability: stability!, difficulty: difficulty!, fastStability: fastStability! }, days!), answer!);
  }
});

test('golden interval inversion', () => {
  for (const [retention, state, expected] of [
    [0.7, { stability: 0.5, difficulty: 5, fastStability: 0.4 }, 3.039791333404169],
    [0.7, { stability: 1, difficulty: 5, fastStability: 0.8 }, 13.220820725860593],
    [0.7, { stability: 3.9221, difficulty: 5, fastStability: 3.13768 }, 134.43247903444777],
  ] as const) {
    near(nextIntervalDays(state, retention), expected);
  }
});

test('golden multi-review histories', () => {
  const cases: Array<{ history: Array<[number, 1|2|3|4]>; expected: [number,number,number] }> = [
    { history: [[0,3],[0.006944444444444444,3]], expected: [5.691489456757392,3.4977167432025262,32.238155986503116] },
    { history: [[0,1],[0.0006944444444444445,3],[0.006944444444444444,3],[1,3]], expected: [2.5166528900813034,5.992217646564867,132.45285833658133] },
    { history: [[0,3],[1,3],[3,3],[8,3],[21,3]], expected: [47.290437623478276,3.400662293377536,1149.3080142246497] },
    { history: [[0,3],[5,1],[0.006944444444444444,3],[1,3],[4,4]], expected: [7.957627163126913,7.891815754342685,146.16937957559588] }
  ];
  for (const {history, expected} of cases) {
    const s = replayReviews(history.map(([elapsedDays,rating])=>({elapsedDays,rating})))!;
    near(s.stability, expected[0]); near(s.difficulty, expected[1]); near(s.fastStability, expected[2]);
  }
  assert.equal(replayReviews([]), null);
});

test('probability decreases over time and interval satisfies target', () => {
  const state = nextMemoryState(initialMemoryState(3), 1, 3);
  let previous = retrievability(state, 0);
  for (const t of [1/1440, 1/24, 1, 30, 365]) {
    const now = retrievability(state, t);
    assert.ok(now < previous);
    previous = now;
  }
  const t = nextIntervalDays(state, 0.9);
  near(retrievability(state, t), 0.9, 1e-8);
  assert.throws(() => nextIntervalDays(state, -0.1));
  assert.throws(() => nextMemoryState(state, -1, 1));
});
