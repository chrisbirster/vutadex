import { POSITIVE_INTEGER_PATTERN } from '../../constants.ts';
import { DeckError } from '../../services/decks.ts';

const USAGE = `Usage:
  deck list
  deck create <name> [--description <text>]
  deck export <id> (prints Plandalf .deck v2 NDJSON)\n  deck show <id>
  deck rename <id> <name>
  deck describe <id> <text | --clear>
  deck delete <id> [--yes]`;

export function showUsageInformation(): number {
  console.error(USAGE);
  return 1;
}

export function parseDeckId(raw: string | undefined): number {
  const id = Number(raw);
  if (!raw || !POSITIVE_INTEGER_PATTERN.test(raw) || !Number.isSafeInteger(id)) {
    throw new DeckError('Expected a positive integer deck ID.');
  }
  return id;
}
