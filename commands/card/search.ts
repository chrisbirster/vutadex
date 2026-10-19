import { DatabaseSync } from 'node:sqlite';
import { listCards } from '../../services/cards.ts';
import { parseDeckId } from '../deck/utils.ts';
import { showUsageInformation } from './utils.ts';

export function runCardSubcommandSearch(db: DatabaseSync, args: string[]): number {
  if (args.length < 2) return showUsageInformation();
  console.table(listCards(db, parseDeckId(args[0]), args.slice(1).join(' ')));
  return 0;
}
