import { DatabaseSync } from 'node:sqlite';
import { listCards } from '../../services/cards.ts';
import { parseDeckId } from '../deck/utils.ts';
import { showUsageInformation } from './utils.ts';

export function runCardSubcommandList(db: DatabaseSync, args: string[]): number {
  if (!args.length) return showUsageInformation();
  const deckId = parseDeckId(args[0]);
  let query: string | undefined;
  if (args.length === 3 && args[1] === '--search') query = args[2];
  else if (args.length !== 1) return showUsageInformation();
  console.table(listCards(db, deckId, query));
  return 0;
}
