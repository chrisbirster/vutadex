import { parseArgs } from 'node:util';

export interface ParsedCommandArgs<Flag extends string> {
  positionals: string[];
  flags: Record<Flag, boolean>;
}

/**
 * Splits subcommand arguments into positionals and boolean flags.
 *
 * Flags may appear anywhere (`delete --yes 3` equals `delete 3 --yes`). Only use this where the
 * positionals are IDs or other fixed tokens: free text that may begin with `-` (names, search
 * queries) would be rejected as an unknown flag.
 *
 * @param flagNames - Accepted flags without the leading dashes, e.g. `['yes']` for `--yes`.
 * @param min - Fewest positionals allowed.
 * @param max - Most positionals allowed.
 * @returns `null` on an unknown flag or the wrong number of positionals; callers show usage.
 */
export function parseCommandArgs<Flag extends string>(
  args: string[], flagNames: readonly Flag[], min: number, max: number
): ParsedCommandArgs<Flag> | null {
  try {
    const { values, positionals } = parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: Object.fromEntries(flagNames.map(name => [name, { type: 'boolean' as const }]))
    });
    if (positionals.length < min || positionals.length > max) return null;
    return { positionals, flags: { ...values } as Record<Flag, boolean> };
  } catch {
    return null;
  }
}
