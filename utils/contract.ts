/**
 * Small design-by-contract helper for pure functions.
 * Runtime validation, NOT a theorem prover.
 * Input parsing and preconditions always run, even in production.
 * Postconditions default to off when NODE_ENV=production.
 */
export interface ContractInput<Args extends readonly unknown[]> {
  parse: (values: readonly unknown[]) => Args;
  /** Type-only witness used for inference; never populated at runtime. */
  readonly __type?: Args;
}

export class ContractViolation extends Error {
  constructor(condition: 'precondition' | 'postcondition') {
    super('Contract ' + condition + ' failed.');
    this.name = 'ContractViolation';
  }
}

export interface ContractDefinition<Args extends readonly unknown[], Result> {
  input: ContractInput<Args>;
  requires?: (args: NoInfer<Args>) => boolean;
  execute: (args: NoInfer<Args>) => Result;
  ensures?: (result: NoInfer<Result>, args: NoInfer<Args>) => boolean;
  /** Explicit override for tests; default is NODE_ENV !== production. */
  checkPostconditions?: boolean;
}

/**
 * Preserve tuple arity at compile time; validate inputs and preconditions at
 * runtime. Postconditions are runtime assertions, not mathematical proofs.
 * This must not wrap code committing persistent effects before ensures.
 */
export function contract<Args extends readonly unknown[], Result>(
  definition: ContractDefinition<Args, Result>,
): (...args: Args) => Result {
  const checkPostconditions = definition.checkPostconditions ?? process.env.NODE_ENV !== 'production';

  return (...rawArgs: Args): Result => {
    const args = definition.input.parse(rawArgs);
    if (definition.requires && !definition.requires(args)) {
      throw new ContractViolation('precondition');
    }

    const result = definition.execute(args);

    if (checkPostconditions && definition.ensures && !definition.ensures(result, args)) {
      throw new ContractViolation('postcondition');
    }
    return result;
  };
}

type NumberTuple<Length extends number, Values extends number[] = []> =
  Values['length'] extends Length ? Values : NumberTuple<Length, [...Values, number]>;

/**
 * Parse exactly N finite JS numbers. Call with numeric literal N to retain
 * a statically-typed tuple, e.g. finiteNumbers(3).
 */
export function finiteNumbers<const N extends number>(count: N): ContractInput<NumberTuple<N>> {
  if (!Number.isSafeInteger(count) || count < 0 || count > 16) {
    throw new RangeError('A contract may accept 0 to 16 finite numbers.');
  }

  return { parse: (values: readonly unknown[]): NumberTuple<N> => {
    if (values.length !== count || !values.every(
      value => typeof value === 'number' && Number.isFinite(value)
    )) {
      throw new RangeError('Expected exactly ' + count + ' finite numbers.');
    }
    return values as NumberTuple<N>;
  } };
}
