import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contract, ContractViolation, finiteNumbers } from '../utils/contract.ts';

const clamp = contract({
  input: finiteNumbers(3),
  requires: ([, min, max]) => min <= max,
  execute: ([value, min, max]) => {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  },
  ensures: (result, [, min, max]) => result >= min && result <= max,
  checkPostconditions: true,
});

test('contracts validate finite input and prevent out-of-order ranges', () => {
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(50, 0, 10), 10);
  assert.equal(clamp(50, 10, 10), 10);
  assert.throws(() => clamp(5, 10, 0), ContractViolation);
  assert.throws(() => clamp(Number.NaN, 0, 10), RangeError);
  assert.throws(() => clamp(Infinity, 0, 10), RangeError);
  assert.throws(() => clamp(2, 0, Infinity), RangeError);
  assert.throws(() => (clamp as (...args: unknown[]) => number)(2, 0), RangeError);
  assert.throws(() => (clamp as (...args: unknown[]) => number)('2', 0, 10), RangeError);
});

test('incorrect implementations fail postconditions when enabled', () => {
  const broken = contract({
    input: finiteNumbers(3),
    requires: ([, min, max]) => min <= max,
    execute: ([value]) => value * 2,
    ensures: (result, [, min, max]) => result >= min && result <= max,
    checkPostconditions: true,
  });

  assert.throws(() => broken(8, 0, 10), /postcondition/);
});

test('production can skip postconditions without skipping input or requires', () => {
  let postconditionCalls = 0;
  const compute = contract({
    input: finiteNumbers(1),
    requires: ([value]) => value >= 0,
    execute: ([value]) => value + 1,
    ensures: () => { postconditionCalls++; return false; },
    checkPostconditions: false,
  });

  assert.equal(compute(1), 2);
  assert.equal(postconditionCalls, 0);
  assert.throws(() => compute(-1), /precondition/);
  assert.throws(() => compute(Number.NaN), RangeError);
  assert.equal(postconditionCalls, 0);
});

test('contract parsers reject invalid arities at definition and invocation', () => {
  assert.throws(() => finiteNumbers(-1), RangeError);
  assert.throws(() => finiteNumbers(17), RangeError);
  assert.throws(() => finiteNumbers(1.5), RangeError);
});
