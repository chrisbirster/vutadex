import { DatabaseSync } from 'node:sqlite';
import { renameDeck } from '../../services/decks.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export function runDeckSubcommandRename(db: DatabaseSync, args: string[]): number {
  if (args.length < 2) return showUsageInformation();
  const deck = renameDeck(db, parseDeckId(args[0]), args.slice(1).join(' '));
  console.log(`Renamed deck ${deck.id} to "${deck.name}".`);
  return 0;
}
