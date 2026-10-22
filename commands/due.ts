import { getDatabase } from '../database/index.ts';
import { getDeck } from '../services/decks.ts';
import { dueCards } from '../services/reviews.ts';
import { parseDeckId } from './deck/utils.ts';
import { parseCommandArgs } from './utils.ts';

const USAGE = 'Usage: due [deck-id]';

export function runDueCommand(args: string[]): number {
  try {
    const parsed = parseCommandArgs(args, [], 0, 1);
    if (!parsed) throw new Error(USAGE);
    const deckId = parsed.positionals.length ? parseDeckId(parsed.positionals[0]) : undefined;
    const db = getDatabase();
    try {
      if (deckId !== undefined) getDeck(db, deckId);
      console.table(dueCards(db, deckId));
      return 0;
    } finally {
      db.close();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
