import { POSITIVE_INTEGER_PATTERN } from '../../constants.ts';
import { CardError } from '../../services/cards.ts';

const USAGE = `Usage:
  card add <deck-id> [--front <text> --back <text>]
  card list <deck-id> [--search <query>]
  card search <deck-id> <query>
  card show <card-id>
  card edit <card-id> [--front <text>] [--back <text>]
  card delete <card-id> [--yes]
  card review <card-id> <again|hard|good|easy>
  card undo <card-id>
  card history <card-id>
  card schedule <card-id>`;

export function showUsageInformation(): number {
  console.error(USAGE);
  return 1;
}

export function parseCardId(raw: string | undefined): number {
  const id = Number(raw);
  if (!raw || !POSITIVE_INTEGER_PATTERN.test(raw) || !Number.isSafeInteger(id)) {
    throw new CardError('Expected a positive integer card ID.');
  }
  return id;
}

export interface CardFields {
  front?: string;
  back?: string;
}

/** Parses `--front <text>` / `--back <text>` pairs; returns `null` on any unknown, repeated or valueless flag. */
export function parseCardFields(args: string[]): CardFields | null {
  const fields: CardFields = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if ((flag !== '--front' && flag !== '--back') || value === undefined || flag.slice(2) in fields) return null;
    fields[flag.slice(2) as keyof CardFields] = value;
  }
  return fields;
}
