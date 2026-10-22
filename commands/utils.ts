import { parseArgs } from 'node:util';

export interface ParsedCommandArgs<Flag extends string, Value extends string = never> {
  positionals: string[];
  flags: Record<Flag, boolean>;
  values: Record<Value, string | undefined>;
}

/**
 * Splits subcommand arguments into positionals, boolean flags and text-valued options.
 *
 * Flags and options may appear anywhere (`delete --yes 3` equals `delete 3 --yes`), so users never
 * have to remember an order. Text that begins with `-` must come after `--`
 * (`deck create -- -Weird`) or be attached with `=` (`--description=-x`).
 *
 * @param flagNames - Boolean flags without the leading dashes, e.g. `['yes']` for `--yes`.
 * @param min - Fewest positionals allowed.
 * @param max - Most positionals allowed.
 * @param valueOptionNames - Options that take a text value, e.g. `['description']`.
 * @returns `null` on an unknown flag, a missing option value or the wrong number of positionals;
 *   callers show usage.
 */
export function parseCommandArgs<Flag extends string, Value extends string = never>(
  args: string[], flagNames: readonly Flag[], min: number, max: number,
  valueOptionNames: readonly Value[] = []
): ParsedCommandArgs<Flag, Value> | null {
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        ...Object.fromEntries(flagNames.map(name => [name, { type: 'boolean' as const }])),
        ...Object.fromEntries(valueOptionNames.map(name => [name, { type: 'string' as const }]))
      }
    });
    if (positionals.length < min || positionals.length > max) return null;
    return {
      positionals,
      flags: Object.fromEntries(flagNames.map(name => [name, values[name] === true])) as Record<Flag, boolean>,
      values: Object.fromEntries(valueOptionNames.map(name => [name, values[name]])) as Record<Value, string | undefined>
    };
  } catch {
    return null;
  }
}
