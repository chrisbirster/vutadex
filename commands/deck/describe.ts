import { DatabaseSync } from 'node:sqlite';
import { describeDeck } from '../../services/decks.ts';
import { showUsageInformation, parseDeckId } from './utils.ts';

export function runDeckSubcommandDescribe(db: DatabaseSync, args: string[]): number {
  if (args.length < 2) return showUsageInformation();
  if (args[1] === '--clear' && args.length !== 2) return showUsageInformation();
  const deck = describeDeck(db, parseDeckId(args[0]), args[1] === '--clear' ? null : args.slice(1).join(' '));
  console.log(`Updated description for deck ${deck.id}.`);
  return 0;
}
