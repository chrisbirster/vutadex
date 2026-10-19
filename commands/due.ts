import { getDatabase } from '../database/index.ts';
import { parseDeckId } from './deck/utils.ts';
import { getDeck } from '../services/decks.ts';
import { dueCards } from '../services/reviews.ts';

export function runDueCommand(args: string[]): number {
  try {
    if (args.length > 1) throw new Error('Usage: due [deck-id]');
    const deckId = args.length ? parseDeckId(args[0]) : undefined;
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
