import type { DatabaseSync } from 'node:sqlite';
import { renameDeck } from '../../services/decks.ts';
import { parseCommandArgs } from '../utils.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export function runDeckSubcommandRename(db: DatabaseSync, args: string[]): number {
  const parsedArgs = parseCommandArgs(args, [], 2, Infinity);
  if (!parsedArgs) return showUsageInformation();
  const [deckIdText, ...nameWords] = parsedArgs.positionals;
  const deck = renameDeck(db, parseDeckId(deckIdText), nameWords.join(' '));
  console.log(`Renamed deck ${deck.id} to "${deck.name}".`);
  return 0;
}
