import assert from 'node:assert/strict';
import { POSITIVE_INTEGER_PATTERN } from '../../constants.ts';
import { DeckError } from '../../services/decks.ts';

const USAGE = `Usage:
  deck list
  deck create <name> [--description <text>]
  deck import <path.deck>
  deck export <id>
  deck show <id>
  deck rename <id> <name>
  deck describe <id> <text>
  deck describe <id> --clear
  deck delete <id> [--yes]

Options may appear anywhere. Write --description=<text> to attach the value.
Text that starts with "-" goes after "--" (or use --description=-text).`;

export function showUsageInformation(): number {
  console.error(USAGE);
  return 1;
}

/**
 * Parses a deck ID typed on the command line.
 *
 * @throws {DeckError} If the text is not a positive safe integer.
 */
export function parseDeckId(userProvidedId: string | undefined): number {
  const deckId = Number(userProvidedId);
  if (!userProvidedId || !POSITIVE_INTEGER_PATTERN.test(userProvidedId) || !Number.isSafeInteger(deckId)) {
    throw new DeckError('Expected a positive integer deck ID.');
  }
  assert.ok(deckId > 0);
  return deckId;
}
